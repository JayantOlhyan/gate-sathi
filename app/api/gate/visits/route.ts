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
import { School } from '@/models/School';
import { User } from '@/models/User';
import { ApprovalRequest } from '@/models/ApprovalRequest';
import { notify } from '@/lib/push';

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

    const school = await School.findById(schoolObjectId).lean();
    const teacherApprovalFor = school?.teacherApprovalFor ?? 'pickup';
    const isPickup = body.purpose === 'Pickup';
    const requiresApproval = !isApproved && (teacherApprovalFor === 'all_flagged' || isPickup);

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
        leftWithStudent: false,
        pickupBlocked: requiresApproval,
        autoClosed: false,
        checkedInBy: checkedInByObjectId,
      });

      const approvalRequests: any[] = [];
      if (requiresApproval) {
        for (const sId of studentObjectIds) {
          const student = await Student.findById(sId).lean();
          if (!student) continue;

          // Route to the class teacher of this student
          const teacher = await User.findOne({
            schoolIds: schoolObjectId,
            role: 'teacher',
            isActive: true,
            classAssignments: {
              $elemMatch: {
                schoolId: schoolObjectId,
                className: student.className,
                section: student.section,
              },
            },
          }).lean();

          const reqDoc = await ApprovalRequest.create({
            schoolId: schoolObjectId,
            visitId: createdVisit._id,
            studentId: student._id,
            visitorId: visitor._id,
            teacherId: teacher ? teacher._id : null,
            status: 'pending',
            requestedBy: checkedInByObjectId,
          });

          approvalRequests.push({
            ...reqDoc.toObject(),
            teacherName: teacher?.name ?? null,
            studentName: student.name,
            className: student.className,
            section: student.section,
          });

          await writeAuditLog({
            schoolId: schoolObjectId,
            userId: checkedInByObjectId,
            action: 'approval.request',
            entityType: 'ApprovalRequest',
            entityId: reqDoc._id,
            metadata: {
              visitId: String(createdVisit._id),
              studentId: String(student._id),
              teacherId: teacher ? String(teacher._id) : null,
              purpose: createdVisit.purpose,
            },
          });

          // Web Push notification via outbox (non-blocking immediate attempt with 3s timeout)
          try {
            if (teacher) {
              await notify(
                teacher._id,
                'approval_request',
                {
                  title: 'Visitor Approval Required',
                  body: `Pickup requested for ${student.name} (${student.className}-${student.section}) by ${visitor.name}.`,
                  url: '/teacher',
                },
                `approval_request:${String(reqDoc._id)}:${String(teacher._id)}`,
                {
                  schoolId: schoolObjectId,
                  fallbackToPrincipalsIfNoSub: true,
                }
              );
            } else {
              const principals = await User.find({
                schoolIds: schoolObjectId,
                role: 'principal',
                isActive: true,
              })
                .select('_id')
                .lean();

              if (principals.length > 0) {
                await notify(
                  principals.map((p) => p._id),
                  'approval_request',
                  {
                    title: 'Visitor Approval Required (No Teacher)',
                    body: `Pickup requested for ${student.name} (${student.className}-${student.section}) by ${visitor.name}.`,
                    url: '/dashboard',
                  },
                  `approval_request:${String(reqDoc._id)}:no_teacher`,
                  {
                    schoolId: schoolObjectId,
                    fallbackToPrincipalsIfNoSub: false,
                  }
                );
              }
            }
          } catch (pushErr) {
            console.warn('[Push] Error enqueuing push for approval request:', pushErr);
          }
        }
      }

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
          pickupBlocked: createdVisit.pickupBlocked,
          reasonCode: createdVisit.reasonCode ?? null,
          reasonText: createdVisit.reasonText ?? null,
        },
      });

      return NextResponse.json(
        { visit: createdVisit, approvalRequests, idempotent: false },
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
