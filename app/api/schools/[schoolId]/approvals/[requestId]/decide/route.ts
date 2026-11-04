import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { handleApiError, requireRole, requireSchoolAccess, RbacError } from '@/lib/rbac';
import { approvalDecisionBodySchema, objectIdSchema } from '@/lib/validations';
import { ApprovalRequest } from '@/models/ApprovalRequest';
import { Student } from '@/models/Student';
import { Visitor } from '@/models/Visitor';
import { Visit } from '@/models/Visit';
import { GuardianLink } from '@/models/GuardianLink';

const paramsSchema = z.object({
  schoolId: z.string().trim().min(1),
  requestId: objectIdSchema,
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ schoolId: string; requestId: string }> }
) {
  try {
    const rawParams = await context.params;
    const { schoolId: requestedSchoolId, requestId } = paramsSchema.parse(rawParams);

    const user = await requireRole('teacher', 'principal', 'super_admin');
    const { schoolId } = await requireSchoolAccess(requestedSchoolId);

    const rawBody = await req.json();
    const body = approvalDecisionBodySchema.parse(rawBody);

    await connectDB();

    const schoolObjectId = new Types.ObjectId(schoolId);
    const requestObjectId = new Types.ObjectId(requestId);
    const callerObjectId = Types.ObjectId.isValid(user.id)
      ? new Types.ObjectId(user.id)
      : new Types.ObjectId();

    const approvalReq = await ApprovalRequest.findOne({
      _id: requestObjectId,
      schoolId: schoolObjectId,
    });

    if (!approvalReq) {
      return NextResponse.json({ error: 'Approval request not found' }, { status: 404 });
    }

    if (approvalReq.status === 'expired') {
      return NextResponse.json(
        { error: 'Cannot decide an expired approval request' },
        { status: 400 }
      );
    }

    // Role and Class authorization
    const student = await Student.findById(approvalReq.studentId).lean();
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (user.role === 'teacher') {
      const isAssignedTeacher =
        approvalReq.teacherId && String(approvalReq.teacherId) === String(user.id);

      const hasClassAssignment = (user.classAssignments || []).some(
        (ca) =>
          String(ca.schoolId) === schoolId &&
          ca.className === student.className &&
          ca.section.toUpperCase() === student.section.toUpperCase()
      );

      if (!isAssignedTeacher && !hasClassAssignment) {
        throw new RbacError(
          'Forbidden: teacher not authorized to decide requests for this student class and section',
          403
        );
      }
    }

    const wasEscalated = approvalReq.status === 'escalated';
    const newStatus = body.decision === 'approve' ? 'approved' : 'rejected';

    approvalReq.status = newStatus;
    approvalReq.decidedBy = callerObjectId;
    approvalReq.decidedAt = new Date();
    if (body.note) {
      approvalReq.note = body.note.trim();
    }
    await approvalReq.save();

    // Audit log for decision
    await writeAuditLog({
      schoolId: schoolObjectId,
      userId: callerObjectId,
      action: body.decision === 'approve' ? 'approval.approve' : 'approval.reject',
      entityType: 'ApprovalRequest',
      entityId: approvalReq._id,
      metadata: {
        requestId: String(approvalReq._id),
        visitId: String(approvalReq.visitId),
        studentId: String(approvalReq.studentId),
        decision: body.decision,
        wasEscalated,
        note: body.note ?? null,
        decidedByRole: user.role,
      },
    });

    // If approved, check if all requests for this visit are approved
    if (body.decision === 'approve') {
      const pendingCount = await ApprovalRequest.countDocuments({
        visitId: approvalReq.visitId,
        status: { $ne: 'approved' },
      });

      if (pendingCount === 0) {
        await Visit.findByIdAndUpdate(approvalReq.visitId, {
          $set: { pickupBlocked: false },
        });
      }

      // Checkbox "Add as approved guardian"
      if (body.addAsApprovedGuardian) {
        const visitor = await Visitor.findById(approvalReq.visitorId).lean();
        const relation = visitor?.defaultRelation || 'Other';

        await GuardianLink.findOneAndUpdate(
          {
            schoolId: schoolObjectId,
            visitorId: approvalReq.visitorId,
            studentId: approvalReq.studentId,
          },
          {
            $set: {
              schoolId: schoolObjectId,
              visitorId: approvalReq.visitorId,
              studentId: approvalReq.studentId,
              approved: true,
              relation,
            },
          },
          { upsert: true, new: true }
        );

        await writeAuditLog({
          schoolId: schoolObjectId,
          userId: callerObjectId,
          action: 'guardian.add',
          entityType: 'GuardianLink',
          metadata: {
            via: 'teacher',
            teacherId: String(callerObjectId),
            studentId: String(approvalReq.studentId),
            visitorId: String(approvalReq.visitorId),
            relation,
          },
        });
      }
    } else {
      // If rejected, ensure visit remains pickupBlocked
      await Visit.findByIdAndUpdate(approvalReq.visitId, {
        $set: { pickupBlocked: true },
      });
    }

    return NextResponse.json(
      {
        ok: true,
        request: approvalReq,
        decision: body.decision,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
