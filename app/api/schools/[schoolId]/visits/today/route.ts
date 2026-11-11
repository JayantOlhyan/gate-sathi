import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { objectIdSchema } from '@/lib/validations';
import { Visit } from '@/models/Visit';
import { ApprovalRequest } from '@/models/ApprovalRequest';
import '@/models/Visitor';
import '@/models/Student';

const paramsSchema = z.object({
  schoolId: objectIdSchema,
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
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

function maskPhone(phone?: string): string {
  if (!phone || phone.length < 5) return 'XXXXXXXXXX';
  return `${phone.slice(0, 2)}XXXXX${phone.slice(-3)}`;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ schoolId: string }> }
) {
  try {
    await requireRole('principal', 'super_admin');
    const { schoolId: requestedSchoolId } = paramsSchema.parse(
      await context.params
    );
    const { schoolId } = await requireSchoolAccess(requestedSchoolId);

    const { searchParams } = new URL(req.url);
    const { limit } = querySchema.parse({
      limit: searchParams.get('limit') ?? undefined,
    });

    await connectDB();

    const schoolObjectId = new Types.ObjectId(schoolId);
    const startOfToday = getStartOfTodayIst();

    const visits = await Visit.find({
      schoolId: schoolObjectId,
      entryAt: { $gte: startOfToday },
    })
      .select(
        '_id visitorId studentIds purpose purposeNote isApproved reasonCode pickupBlocked entryAt exitAt'
      )
      .populate('visitorId', 'name phone defaultRelation')
      .populate('studentIds', 'name className section')
      .sort({ entryAt: -1 })
      .limit(limit)
      .lean();

    const visitIds = visits.map((v) => v._id);
    const approvalReqs =
      visitIds.length > 0
        ? await ApprovalRequest.find({
            schoolId: schoolObjectId,
            visitId: { $in: visitIds },
          })
            .select('visitId status')
            .lean()
        : [];

    const approvalByVisitId = new Map<string, string>();
    for (const ar of approvalReqs) {
      const vid = String(ar.visitId);
      const prev = approvalByVisitId.get(vid);
      if (!prev || ar.status === 'rejected' || ar.status === 'escalated') {
        approvalByVisitId.set(vid, ar.status);
      }
    }

    const rows = visits.map((v) => {
      const visitor = v.visitorId as any;
      const students = Array.isArray(v.studentIds)
        ? (v.studentIds as any[]).map((s) => ({
            name: s?.name ?? '',
            className: s?.className ?? '',
            section: s?.section ?? '',
          }))
        : [];

      const approvalStatus = approvalByVisitId.get(String(v._id)) ?? null;

      let status: 'exited' | 'inside' | 'approved' | 'rejected' | 'pending' =
        v.exitAt ? 'exited' : 'inside';
      if (approvalStatus === 'rejected') {
        status = 'rejected';
      } else if (
        approvalStatus === 'pending' ||
        approvalStatus === 'escalated'
      ) {
        status = 'pending';
      } else if (approvalStatus === 'approved' && !v.exitAt) {
        status = 'approved';
      }

      return {
        visitId: String(v._id),
        entryAt: v.entryAt,
        exitAt: v.exitAt ?? null,
        visitorName: visitor?.name ?? '',
        maskedPhone: maskPhone(visitor?.phone),
        relation: visitor?.defaultRelation || v.reasonCode || '',
        students,
        purpose: v.purpose,
        purposeNote: v.purposeNote ?? null,
        isApproved: Boolean(v.isApproved),
        pickupBlocked: Boolean(v.pickupBlocked),
        status,
      };
    });

    return NextResponse.json({ schoolId, visits: rows }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
