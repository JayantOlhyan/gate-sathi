import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { handleApiError, requireRole, requireSchoolAccess, RbacError } from '@/lib/rbac';
import { verifyUploadedPhotoKey } from '@/lib/r2';
import { gateCreateVisitBodySchema } from '@/lib/validations';
import { Student } from '@/models/Student';
import { Visitor } from '@/models/Visitor';
import { GuardianLink } from '@/models/GuardianLink';
import { Visit, UNAPPROVED_REASON_CODES } from '@/models/Visit';

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('guard', 'principal', 'super_admin');

    const rawBody = await req.json();
    // Zod strips any client-supplied isApproved
    const body = gateCreateVisitBodySchema.parse(rawBody);
    const { schoolId } = await requireSchoolAccess(body.schoolId);

    await connectDB();

    const schoolObjectId = new Types.ObjectId(schoolId);

    // 1. Idempotency check by { schoolId, clientId }
    const existingVisit = await Visit.findOne({
      schoolId: schoolObjectId,
      clientId: body.clientId,
    }).lean();

    if (existingVisit) {
      return NextResponse.json(
        { visit: existingVisit, idempotent: true },
        { status: 200 }
      );
    }

    // 2. Validate photoKey via HeadObject (must start with `${schoolId}/`, exist, and be <= 1 MB)
    if (body.photoKey) {
      await verifyUploadedPhotoKey({
        schoolId,
        photoKey: body.photoKey,
      });
    }

    // 3. Ensure EVERY selected student belongs to schoolId and is active
    const uniqueStudentIds = Array.from(new Set(body.studentIds));
    const studentObjectIds = uniqueStudentIds.map((id) => new Types.ObjectId(id));

    const foundStudents = await Student.find({
      _id: { $in: studentObjectIds },
      schoolId: schoolObjectId,
      isActive: true,
    })
      .select('_id')
      .lean();

    if (foundStudents.length !== uniqueStudentIds.length) {
      throw new RbacError(
        'Forbidden: one or more students do not belong to this school',
        403
      );
    }

    // 4. Find or create Visitor by { schoolId, phone }
    const visitorUpdate: Record<string, unknown> = {
      name: body.name.trim(),
    };
    if (body.photoKey) {
      visitorUpdate.photoKey = body.photoKey;
    }
    if (body.relation) {
      visitorUpdate.defaultRelation = body.relation;
    }
    if (body.consentAt) {
      visitorUpdate.consentAt = body.consentAt;
    }
    if (body.consentVersion) {
      visitorUpdate.consentVersion = body.consentVersion;
    }

    const visitor = await Visitor.findOneAndUpdate(
      { schoolId: schoolObjectId, phone: body.phone },
      {
        $set: visitorUpdate,
        $setOnInsert: {
          schoolId: schoolObjectId,
          phone: body.phone,
          isBlocked: false,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    // 5. Server computes isApproved from GuardianLink for EVERY selected student
    const approvedLinks = await GuardianLink.find({
      schoolId: schoolObjectId,
      visitorId: visitor._id,
      studentId: { $in: studentObjectIds },
      approved: true,
    })
      .select('studentId')
      .lean();

    const approvedStudentSet = new Set(
      approvedLinks.map((l) => String(l.studentId))
    );
    const isApproved = uniqueStudentIds.every((sid) =>
      approvedStudentSet.has(sid)
    );

    if (!isApproved) {
      if (
        !body.reasonCode ||
        !UNAPPROVED_REASON_CODES.includes(body.reasonCode)
      ) {
        return NextResponse.json(
          {
            error:
              'Unapproved visit requires reasonCode (Relative, Neighbour, Driver/auto, or Other)',
            isApproved: false,
          },
          { status: 400 }
        );
      }

      if (body.reasonCode === 'Other') {
        const text = body.reasonText?.trim() ?? '';
        if (text.length < 5) {
          return NextResponse.json(
            {
              error:
                'Unapproved visit with reasonCode "Other" requires reasonText of at least 5 characters',
              isApproved: false,
            },
            { status: 400 }
          );
        }
      }
    }

    if (body.purpose === 'Other' && !body.purposeNote?.trim()) {
      return NextResponse.json(
        { error: 'Please specify details for Other purpose' },
        { status: 400 }
      );
    }

    const checkedInByObjectId = Types.ObjectId.isValid(user.id)
      ? new Types.ObjectId(user.id)
      : new Types.ObjectId();

    try {
      const createdVisit = await Visit.create({
        schoolId: schoolObjectId,
        clientId: body.clientId,
        visitorId: visitor._id,
        studentIds: studentObjectIds,
        purpose: body.purpose,
        purposeNote: body.purposeNote?.trim(),
        isApproved,
        reasonCode: isApproved ? undefined : body.reasonCode,
        reasonText: isApproved ? undefined : body.reasonText?.trim(),
        entryAt: new Date(),
        exitAt: null,
        autoClosed: false,
        checkedInBy: checkedInByObjectId,
      });

      await writeAuditLog({
        schoolId: schoolObjectId,
        userId: checkedInByObjectId,
        action: 'visit.create',
        entityType: 'Visit',
        entityId: createdVisit._id,
        metadata: {
          clientId: createdVisit.clientId,
          visitorId: String(visitor._id),
          studentIds: uniqueStudentIds,
          purpose: createdVisit.purpose,
          isApproved,
          reasonCode: createdVisit.reasonCode ?? null,
          reasonText: createdVisit.reasonText ?? null,
        },
      });

      return NextResponse.json(
        { visit: createdVisit, idempotent: false },
        { status: 201 }
      );
    } catch (err) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: number }).code === 11000
      ) {
        const concurrentVisit = await Visit.findOne({
          schoolId: schoolObjectId,
          clientId: body.clientId,
        }).lean();
        if (concurrentVisit) {
          return NextResponse.json(
            { visit: concurrentVisit, idempotent: true },
            { status: 200 }
          );
        }
      }
      throw err;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
