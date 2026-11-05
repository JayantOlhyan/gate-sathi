import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { objectIdSchema } from '@/lib/validations';
import { Visit } from '@/models/Visit';
import { ApprovalRequest } from '@/models/ApprovalRequest';
import { User } from '@/models/User';
import {
  checkAndEscalatePendingRequests,
  checkAndExpireStaleRequests,
} from '@/lib/escalate-approvals';

const paramsSchema = z.object({
  visitId: objectIdSchema,
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ visitId: string }> }
) {
  try {
    const user = await requireRole('guard', 'principal', 'super_admin', 'teacher');
    const { visitId } = paramsSchema.parse(await context.params);

    const { searchParams } = new URL(req.url);
    const schoolIdParam = searchParams.get('schoolId');

    await connectDB();

    const visitObjectId = new Types.ObjectId(visitId);
    const visit = await Visit.findById(visitObjectId).lean();
    if (!visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    const schoolId = String(visit.schoolId);
    await requireSchoolAccess(schoolId);

    // Auto-escalate any pending requests for this school if expired > 5m, and expire stale requests
    await checkAndEscalatePendingRequests(schoolId);
    await checkAndExpireStaleRequests(schoolId);

    const requests = await ApprovalRequest.find({ visitId: visitObjectId })
      .populate('teacherId', 'name phone')
      .populate('studentId', 'name className section rollNumber')
      .populate('decidedBy', 'name role')
      .lean();

    if (requests.length === 0) {
      return NextResponse.json(
        {
          hasApproval: false,
          pickupBlocked: Boolean(visit.pickupBlocked),
          status: 'none',
          requests: [],
        },
        { status: 200 }
      );
    }

    // Determine overall status
    // If any rejected -> rejected
    // Else if any pending/escalated -> pending (or escalated)
    // Else if all approved -> approved
    // Else expired
    const hasRejected = requests.some((r) => r.status === 'rejected');
    const hasPending = requests.some((r) => r.status === 'pending');
    const hasEscalated = requests.some((r) => r.status === 'escalated');
    const allApproved = requests.every((r) => r.status === 'approved');
    const allExpired = requests.every((r) => r.status === 'expired');

    let overallStatus: 'pending' | 'escalated' | 'approved' | 'rejected' | 'expired' = 'pending';
    if (hasRejected) {
      overallStatus = 'rejected';
    } else if (allApproved) {
      overallStatus = 'approved';
    } else if (hasEscalated) {
      overallStatus = 'escalated';
    } else if (hasPending) {
      overallStatus = 'pending';
    } else if (allExpired) {
      overallStatus = 'expired';
    }

    const teacherNames = Array.from(
      new Set(
        requests
          .map((r) => (r.teacherId as any)?.name)
          .filter((name): name is string => Boolean(name))
      )
    );

    const decidedByNames = Array.from(
      new Set(
        requests
          .map((r) => (r.decidedBy as any)?.name)
          .filter((name): name is string => Boolean(name))
      )
    );

    const latestDecidedAt = requests
      .map((r) => r.decidedAt)
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

    const notes = requests
      .map((r) => r.note?.trim())
      .filter((n): n is string => Boolean(n));

    return NextResponse.json(
      {
        hasApproval: true,
        pickupBlocked: Boolean(visit.pickupBlocked),
        status: overallStatus,
        teacherName: teacherNames.length > 0 ? teacherNames.join(', ') : 'Principal (प्रधानाचार्य)',
        decidedByName: decidedByNames.length > 0 ? decidedByNames.join(', ') : null,
        decidedAt: latestDecidedAt,
        notes,
        requests: requests.map((r) => ({
          _id: String(r._id),
          status: r.status,
          studentName: (r.studentId as any)?.name,
          className: (r.studentId as any)?.className,
          section: (r.studentId as any)?.section,
          teacherName: (r.teacherId as any)?.name ?? null,
          decidedByName: (r.decidedBy as any)?.name ?? null,
          note: r.note ?? null,
          decidedAt: r.decidedAt,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
