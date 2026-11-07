import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { objectIdSchema } from '@/lib/validations';
import { ApprovalRequest } from '@/models/ApprovalRequest';
import { School } from '@/models/School';
import '@/models/Visitor';
import '@/models/Student';
import '@/models/User';
import '@/models/Visit';
import {
  checkAndEscalatePendingRequests,
  checkAndExpireStaleRequests,
} from '@/lib/escalate-approvals';

const querySchema = z.object({
  schoolId: objectIdSchema,
});

function getStartOfTodayIst(now: Date = new Date()): Date {
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffsetMs);
  const startOfIstDayUtcMs =
    Date.UTC(
      istTime.getUTCFullYear(),
      istTime.getUTCMonth(),
      istTime.getUTCDate(),
      0,
      0,
      0,
      0
    ) - istOffsetMs;
  return new Date(startOfIstDayUtcMs);
}

export async function GET(req: NextRequest) {
  try {
    await requireRole('guard', 'principal', 'super_admin');

    const { searchParams } = new URL(req.url);
    const { schoolId: requestedSchoolId } = querySchema.parse({
      schoolId: searchParams.get('schoolId') ?? '',
    });

    const { schoolId } = await requireSchoolAccess(requestedSchoolId);
    await connectDB();

    const schoolObjectId = new Types.ObjectId(schoolId);

    await checkAndEscalatePendingRequests(schoolObjectId);
    await checkAndExpireStaleRequests(schoolObjectId);

    const startOfToday = getStartOfTodayIst();
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    const [school, requests] = await Promise.all([
      School.findById(schoolObjectId)
        .select('teacherApprovalEscalationMinutes teacherApprovalExpiryMinutes')
        .lean(),
      ApprovalRequest.find({
        schoolId: schoolObjectId,
        $or: [
          {
            status: { $in: ['pending', 'escalated'] },
            createdAt: { $gte: startOfToday },
          },
          {
            status: { $in: ['approved', 'rejected', 'expired'] },
            $or: [
              { decidedAt: { $gte: thirtyMinAgo } },
              { updatedAt: { $gte: thirtyMinAgo } },
            ],
          },
        ],
      })
        .populate('visitorId', 'name defaultRelation')
        .populate('studentId', 'name className section')
        .populate('teacherId', 'name')
        .populate('decidedBy', 'name')
        .populate('visitId', 'purpose reasonCode')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    return NextResponse.json(
      {
        schoolId,
        escalationMinutes: school?.teacherApprovalEscalationMinutes ?? 5,
        expiryMinutes: school?.teacherApprovalExpiryMinutes ?? 30,
        items: requests.map((r) => ({
          requestId: String(r._id),
          visitId: String((r.visitId as any)?._id ?? r.visitId),
          status: r.status,
          visitorName: (r.visitorId as any)?.name ?? '',
          relation:
            (r.visitId as any)?.reasonCode ||
            (r.visitorId as any)?.defaultRelation ||
            '',
          studentName: (r.studentId as any)?.name ?? '',
          className: (r.studentId as any)?.className ?? '',
          section: (r.studentId as any)?.section ?? '',
          purpose: (r.visitId as any)?.purpose ?? 'Pickup',
          teacherName: (r.teacherId as any)?.name ?? null,
          decidedByName: (r.decidedBy as any)?.name ?? null,
          decidedAt: r.decidedAt ?? null,
          note: r.note ?? null,
          createdAt: r.createdAt,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
