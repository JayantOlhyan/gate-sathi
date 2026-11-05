import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { ApprovalRequest } from '@/models/ApprovalRequest';
import { Student } from '@/models/Student';
import '@/models/Visitor';
import '@/models/Visit';
import '@/models/User';
import { createPresignedGetUrl } from '@/lib/r2';
import {
  checkAndEscalatePendingRequests,
  checkAndExpireStaleRequests,
} from '@/lib/escalate-approvals';

const paramsSchema = z.object({
  schoolId: z.string().trim().min(1),
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ schoolId: string }> }
) {
  try {
    const rawParams = await context.params;
    const { schoolId: requestedSchoolId } = paramsSchema.parse(rawParams);

    const user = await requireRole('teacher', 'principal', 'super_admin');
    const { schoolId } = await requireSchoolAccess(requestedSchoolId);

    const { searchParams } = new URL(req.url);
    const isHistory = searchParams.get('history') === 'true';

    await connectDB();

    const schoolObjectId = new Types.ObjectId(schoolId);

    // Auto-escalate any pending requests past 5m, and expire stale requests
    await checkAndEscalatePendingRequests(schoolObjectId);
    await checkAndExpireStaleRequests(schoolObjectId);

    const filter: Record<string, unknown> = {
      schoolId: schoolObjectId,
    };

    if (isHistory) {
      // 30 days history
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      filter.status = { $in: ['approved', 'rejected'] };
      filter.decidedAt = { $gte: thirtyDaysAgo };
      if (user.role === 'teacher') {
        filter.decidedBy = new Types.ObjectId(user.id);
      }
    } else {
      // Active pending / escalated requests
      filter.status = { $in: ['pending', 'escalated'] };
      if (user.role === 'teacher') {
        const assignments = (user.classAssignments || []).filter(
          (a) => String(a.schoolId) === schoolId
        );
        const userObjectId = new Types.ObjectId(user.id);

        let studentIds: Types.ObjectId[] = [];
        if (assignments.length > 0) {
          const matchingStudents = await Student.find({
            schoolId: schoolObjectId,
            $or: assignments.map((a) => ({ className: a.className, section: a.section })),
          })
            .select('_id')
            .lean();
          studentIds = matchingStudents.map((s) => s._id);
        }

        filter.$or = [
          { teacherId: userObjectId },
          { studentId: { $in: studentIds } },
        ];
      }
    }

    const requests = await ApprovalRequest.find(filter)
      .populate('studentId', 'name className section rollNumber')
      .populate('visitorId', 'name phone photoKey defaultRelation')
      .populate('visitId', 'purpose purposeNote reasonCode reasonText entryAt')
      .populate('teacherId', 'name')
      .populate('decidedBy', 'name role')
      .sort({ createdAt: -1 })
      .lean();

    const formattedRequests = await Promise.all(
      requests.map(async (r) => {
        const visitor = r.visitorId as any;
        let signedPhotoUrl: string | null = null;
        if (visitor?.photoKey) {
          try {
            signedPhotoUrl = await createPresignedGetUrl({
              schoolId,
              photoKey: visitor.photoKey,
            });
          } catch {
            signedPhotoUrl = null;
          }
        }

        return {
          _id: String(r._id),
          schoolId: String(r.schoolId),
          visitId: String((r.visitId as any)?._id || r.visitId),
          studentId: String((r.studentId as any)?._id || r.studentId),
          visitorId: String(visitor?._id || r.visitorId),
          teacherId: r.teacherId ? String((r.teacherId as any)._id || r.teacherId) : null,
          teacherName: (r.teacherId as any)?.name ?? null,
          status: r.status,
          requestedBy: String(r.requestedBy),
          decidedBy: r.decidedBy ? String((r.decidedBy as any)._id || r.decidedBy) : null,
          decidedByName: (r.decidedBy as any)?.name ?? null,
          decidedAt: r.decidedAt,
          escalatedAt: r.escalatedAt,
          note: r.note ?? null,
          createdAt: r.createdAt,
          student: r.studentId,
          visitor: visitor
            ? {
                ...visitor,
                signedPhotoUrl,
              }
            : null,
          visit: r.visitId,
        };
      })
    );

    return NextResponse.json(
      {
        schoolId,
        requests: formattedRequests,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
