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

    // 1. Initial check for existence and student details
    const existingReq = await ApprovalRequest.findOne({
      _id: requestObjectId,
      schoolId: schoolObjectId,
    }).lean();

    if (!existingReq) {
      return NextResponse.json({ error: 'Approval request not found' }, { status: 404 });
    }

    if (existingReq.status === 'expired') {
      return NextResponse.json(
        {
          error: 'Cannot decide an expired approval request',
          status: 'expired',
          decidedAt: existingReq.decidedAt,
        },
        { status: 409 }
      );
    }

    // Role and Class authorization
    const student = await Student.findById(existingReq.studentId).lean();
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (user.role === 'teacher') {
      const isAssignedTeacher =
        existingReq.teacherId && String(existingReq.teacherId) === String(user.id);

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

    const wasEscalated = existingReq.status === 'escalated';
    const newStatus = body.decision === 'approve' ? 'approved' : 'rejected';
    const now = new Date();

    const updateFields: Record<string, unknown> = {
      status: newStatus,
      decidedBy: callerObjectId,
      decidedAt: now,
    };
    if (body.note) {
      updateFields.note = body.note.trim();
    }

    // 2. Atomic findOneAndUpdate filtered on status in ['pending', 'escalated']
    const updatedReq = await ApprovalRequest.findOneAndUpdate(
      {
        _id: requestObjectId,
        schoolId: schoolObjectId,
        status: { $in: ['pending', 'escalated'] },
      },
      {
        $set: updateFields,
      },
      { new: true }
    );

    // If another caller already decided or expired it, return 409 Conflict with details
    if (!updatedReq) {
      const currentDoc = await ApprovalRequest.findOne({
        _id: requestObjectId,
        schoolId: schoolObjectId,
      })
        .populate('decidedBy', 'name role')
        .lean();

      return NextResponse.json(
        {
          error: `Request has already been finalized with status '${currentDoc?.status}'`,
          status: currentDoc?.status,
          decidedBy:
            (currentDoc?.decidedBy as any)?.name ??
            (currentDoc?.decidedBy ? String(currentDoc.decidedBy) : null),
          decidedAt: currentDoc?.decidedAt ?? null,
        },
        { status: 409 }
      );
    }

    // 3. Audit log for decision
    await writeAuditLog({
      schoolId: schoolObjectId,
      userId: callerObjectId,
      action: body.decision === 'approve' ? 'approval.approve' : 'approval.reject',
      entityType: 'ApprovalRequest',
      entityId: updatedReq._id,
      metadata: {
        requestId: String(updatedReq._id),
        visitId: String(updatedReq.visitId),
        studentId: String(updatedReq.studentId),
        decision: body.decision,
        wasEscalated,
        note: body.note ?? null,
        decidedByRole: user.role,
      },
    });

    // 4. If approved, check if all requests for this visit are approved
    if (body.decision === 'approve') {
      const pendingCount = await ApprovalRequest.countDocuments({
        visitId: updatedReq.visitId,
        status: { $ne: 'approved' },
      });

      if (pendingCount === 0) {
        await Visit.findByIdAndUpdate(updatedReq.visitId, {
          $set: { pickupBlocked: false },
        });
      }

      // Checkbox "Add as approved guardian"
      if (body.addAsApprovedGuardian) {
        const visitor = await Visitor.findById(updatedReq.visitorId).lean();
        const relation = visitor?.defaultRelation || 'Other';

        await GuardianLink.findOneAndUpdate(
          {
            schoolId: schoolObjectId,
            visitorId: updatedReq.visitorId,
            studentId: updatedReq.studentId,
          },
          {
            $set: {
              schoolId: schoolObjectId,
              visitorId: updatedReq.visitorId,
              studentId: updatedReq.studentId,
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
            studentId: String(updatedReq.studentId),
            visitorId: String(updatedReq.visitorId),
            relation,
          },
        });
      }
    } else {
      // If rejected, ensure visit remains pickupBlocked
      await Visit.findByIdAndUpdate(updatedReq.visitId, {
        $set: { pickupBlocked: true },
      });
    }

    return NextResponse.json(
      {
        ok: true,
        request: updatedReq,
        decision: body.decision,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
