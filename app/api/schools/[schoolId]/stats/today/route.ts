import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { objectIdSchema } from '@/lib/validations';
import { Visit } from '@/models/Visit';
import { ApprovalRequest } from '@/models/ApprovalRequest';
import {
  checkAndEscalatePendingRequests,
  checkAndExpireStaleRequests,
} from '@/lib/escalate-approvals';

const paramsSchema = z.object({
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

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ schoolId: string }> }
) {
  try {
    await requireRole('principal', 'super_admin');
    const { schoolId: requestedSchoolId } = paramsSchema.parse(
      await context.params
    );
    const { schoolId } = await requireSchoolAccess(requestedSchoolId);

    await connectDB();

    const schoolObjectId = new Types.ObjectId(schoolId);
    await checkAndEscalatePendingRequests(schoolObjectId);
    await checkAndExpireStaleRequests(schoolObjectId);

    const startOfToday = getStartOfTodayIst();

    const [
      insideNow,
      entriesToday,
      pendingApprovals,
      pickupsApprovedToday,
    ] = await Promise.all([
      Visit.countDocuments({
        schoolId: schoolObjectId,
        exitAt: null,
      }),
      Visit.countDocuments({
        schoolId: schoolObjectId,
        entryAt: { $gte: startOfToday },
      }),
      ApprovalRequest.countDocuments({
        schoolId: schoolObjectId,
        status: { $in: ['pending', 'escalated'] },
      }),
      Visit.countDocuments({
        schoolId: schoolObjectId,
        purpose: 'Pickup',
        entryAt: { $gte: startOfToday },
        isApproved: true,
        pickupBlocked: { $ne: true },
      }),
    ]);

    return NextResponse.json(
      {
        insideNow,
        entriesToday,
        pendingApprovals,
        pickupsApprovedToday,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
