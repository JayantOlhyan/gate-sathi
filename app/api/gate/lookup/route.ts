import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { createPresignedGetUrl } from '@/lib/r2';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { gateLookupQuerySchema } from '@/lib/validations';
import { Visitor } from '@/models/Visitor';
import { GuardianLink } from '@/models/GuardianLink';
import '@/models/Student';

export async function GET(req: NextRequest) {
  try {
    await requireRole('guard', 'principal', 'super_admin');

    const { searchParams } = new URL(req.url);
    const query = gateLookupQuerySchema.parse({
      schoolId: searchParams.get('schoolId') ?? '',
      phone: searchParams.get('phone') ?? '',
    });

    const { schoolId } = await requireSchoolAccess(query.schoolId);
    await connectDB();

    const schoolObjectId = new Types.ObjectId(schoolId);
    const visitor = await Visitor.findOne({
      schoolId: schoolObjectId,
      phone: query.phone,
    }).lean();

    if (!visitor) {
      return NextResponse.json({ found: false }, { status: 200 });
    }

    let signedPhotoUrl: string | null = null;
    if (visitor.photoKey && visitor.photoKey.startsWith(`${schoolId}/visitors/`)) {
      signedPhotoUrl = await createPresignedGetUrl({
        schoolId,
        photoKey: visitor.photoKey,
      });
    }

    const links = await GuardianLink.find({
      schoolId: schoolObjectId,
      visitorId: visitor._id,
      approved: true,
    })
      .populate('studentId', 'name admissionNo className section rollNumber isActive')
      .lean();

    const linkedStudents = links
      .map((l) => {
        const s = l.studentId as unknown as {
          _id?: Types.ObjectId;
          name?: string;
          admissionNo?: string;
          className?: string;
          section?: string;
          rollNumber?: string;
          isActive?: boolean;
        } | null;

        if (!s?._id || s.isActive === false) return null;

        return {
          studentId: String(s._id),
          name: s.name ?? '',
          admissionNo: s.admissionNo ?? '',
          className: s.className ?? '',
          section: s.section ?? '',
          rollNumber: s.rollNumber ?? '',
          relation: l.relation,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return NextResponse.json(
      {
        found: true,
        visitor: {
          visitorId: String(visitor._id),
          name: visitor.name,
          phone: visitor.phone,
          photoKey: visitor.photoKey ?? null,
          signedPhotoUrl,
          defaultRelation: visitor.defaultRelation ?? null,
          consentAt: visitor.consentAt ?? null,
          consentVersion: visitor.consentVersion ?? null,
        },
        linkedStudents,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
