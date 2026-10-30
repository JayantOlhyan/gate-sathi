import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { createPresignedGetUrl } from '@/lib/r2';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { Visit } from '@/models/Visit';
import '@/models/Visitor';
import '@/models/Student';

const querySchema = z.object({
  schoolId: z.string().trim().min(1),
});

export async function GET(req: NextRequest) {
  try {
    await requireRole('guard', 'principal', 'super_admin');

    const { searchParams } = new URL(req.url);
    const query = querySchema.parse({
      schoolId: searchParams.get('schoolId') ?? '',
    });

    const { schoolId } = await requireSchoolAccess(query.schoolId);
    await connectDB();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const openVisits = await Visit.find({
      schoolId: new Types.ObjectId(schoolId),
      exitAt: null,
      entryAt: { $gte: startOfToday },
    })
      .sort({ entryAt: -1 })
      .populate('visitorId', 'name phone photoKey')
      .populate('studentIds', 'name admissionNo className section')
      .lean();

    const items = await Promise.all(
      openVisits.map(async (v) => {
        const visitor = v.visitorId as unknown as {
          _id?: Types.ObjectId;
          name?: string;
          phone?: string;
          photoKey?: string;
        } | null;

        let signedPhotoUrl: string | null = null;
        if (
          visitor?.photoKey &&
          visitor.photoKey.startsWith(`${schoolId}/visitors/`)
        ) {
          signedPhotoUrl = await createPresignedGetUrl({
            schoolId,
            photoKey: visitor.photoKey,
          });
        }

        const students = Array.isArray(v.studentIds)
          ? (
              v.studentIds as unknown as Array<{
                _id?: Types.ObjectId;
                name?: string;
                admissionNo?: string;
                className?: string;
                section?: string;
              }>
            ).map((s) => ({
              studentId: s?._id ? String(s._id) : '',
              name: s?.name ?? '',
              admissionNo: s?.admissionNo ?? '',
              className: s?.className ?? '',
              section: s?.section ?? '',
            }))
          : [];

        return {
          visitId: String(v._id),
          visitorName: visitor?.name ?? '',
          visitorPhone: visitor?.phone ?? '',
          signedPhotoUrl,
          students,
          purpose: v.purpose,
          isApproved: v.isApproved,
          entryAt: v.entryAt,
        };
      })
    );

    return NextResponse.json({ visits: items }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
