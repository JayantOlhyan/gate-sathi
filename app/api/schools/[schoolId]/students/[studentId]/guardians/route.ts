import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { handleApiError, requireRole, requireSchoolAccess, RbacError } from '@/lib/rbac';
import { guardianAddBodySchema, objectIdSchema } from '@/lib/validations';
import { Student } from '@/models/Student';
import { Visitor } from '@/models/Visitor';
import { GuardianLink } from '@/models/GuardianLink';

const paramsSchema = z.object({
  schoolId: z.string().trim().min(1),
  studentId: objectIdSchema,
});

const deleteSchema = z.object({
  guardianLinkId: objectIdSchema,
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ schoolId: string; studentId: string }> }
) {
  try {
    const rawParams = await context.params;
    const { schoolId: requestedSchoolId, studentId } = paramsSchema.parse(rawParams);

    await requireRole('principal', 'super_admin');
    const { schoolId } = await requireSchoolAccess(requestedSchoolId);

    await connectDB();

    const student = await Student.findOne({
      _id: new Types.ObjectId(studentId),
      schoolId: new Types.ObjectId(schoolId),
    })
      .select('_id')
      .lean();

    if (!student) {
      throw new RbacError('Forbidden: student does not belong to this school', 403);
    }

    const links = await GuardianLink.find({
      schoolId: new Types.ObjectId(schoolId),
      studentId: new Types.ObjectId(studentId),
      approved: true,
    })
      .populate('visitorId', 'name phone photoUrl')
      .lean();

    const guardians = links.map((link) => {
      const visitor = link.visitorId as unknown as {
        _id?: Types.ObjectId;
        name?: string;
        phone?: string;
        photoUrl?: string;
      } | null;

      return {
        guardianLinkId: String(link._id),
        visitorId: visitor?._id ? String(visitor._id) : '',
        name: visitor?.name ?? '',
        phone: visitor?.phone ?? '',
        photoUrl: visitor?.photoUrl ?? null,
        relation: link.relation,
        approved: link.approved,
        approvedAt: link.approvedAt,
      };
    });

    return NextResponse.json({ guardians }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ schoolId: string; studentId: string }> }
) {
  try {
    const rawParams = await context.params;
    const { schoolId: requestedSchoolId, studentId } = paramsSchema.parse(rawParams);

    const user = await requireRole('principal', 'super_admin');
    const { schoolId } = await requireSchoolAccess(requestedSchoolId);

    const rawBody = await req.json();
    const body = guardianAddBodySchema.parse(rawBody);

    await connectDB();

    const schoolObjectId = new Types.ObjectId(schoolId);
    const studentObjectId = new Types.ObjectId(studentId);

    // Ensure student belongs to the authorized schoolId
    const student = await Student.findOne({
      _id: studentObjectId,
      schoolId: schoolObjectId,
    })
      .select('_id name')
      .lean();

    if (!student) {
      throw new RbacError('Forbidden: student does not belong to this school', 403);
    }

    // Find-or-create Visitor by {schoolId, phone}
    const visitor = await Visitor.findOneAndUpdate(
      { schoolId: schoolObjectId, phone: body.phone },
      {
        $set: {
          name: body.name,
        },
        $setOnInsert: {
          schoolId: schoolObjectId,
          phone: body.phone,
          isBlocked: false,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    const approvedByObjectId = Types.ObjectId.isValid(user.id)
      ? new Types.ObjectId(user.id)
      : new Types.ObjectId();

    const now = new Date();
    const guardianLink = await GuardianLink.findOneAndUpdate(
      {
        schoolId: schoolObjectId,
        studentId: studentObjectId,
        visitorId: visitor._id,
      },
      {
        $set: {
          schoolId: schoolObjectId,
          studentId: studentObjectId,
          visitorId: visitor._id,
          relation: body.relation,
          approved: true,
          approvedBy: approvedByObjectId,
          approvedAt: now,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    await writeAuditLog({
      schoolId: schoolObjectId,
      userId: approvedByObjectId,
      action: 'guardian.add',
      entityType: 'GuardianLink',
      entityId: guardianLink._id,
      metadata: {
        studentId,
        visitorId: String(visitor._id),
        phone: body.phone,
        name: body.name,
        relation: body.relation,
      },
    });

    return NextResponse.json(
      {
        guardian: {
          guardianLinkId: String(guardianLink._id),
          visitorId: String(visitor._id),
          name: visitor.name,
          phone: visitor.phone,
          photoUrl: visitor.photoUrl ?? null,
          relation: guardianLink.relation,
          approved: guardianLink.approved,
          approvedAt: guardianLink.approvedAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ schoolId: string; studentId: string }> }
) {
  try {
    const rawParams = await context.params;
    const { schoolId: requestedSchoolId, studentId } = paramsSchema.parse(rawParams);

    const user = await requireRole('principal', 'super_admin');
    const { schoolId } = await requireSchoolAccess(requestedSchoolId);

    const { searchParams } = new URL(req.url);
    let guardianLinkId = searchParams.get('guardianLinkId');
    if (!guardianLinkId) {
      const body = await req.json().catch(() => ({}));
      guardianLinkId = body?.guardianLinkId;
    }

    const parsedDelete = deleteSchema.parse({ guardianLinkId });

    await connectDB();

    const schoolObjectId = new Types.ObjectId(schoolId);
    const studentObjectId = new Types.ObjectId(studentId);

    const link = await GuardianLink.findOneAndUpdate(
      {
        _id: new Types.ObjectId(parsedDelete.guardianLinkId),
        schoolId: schoolObjectId,
        studentId: studentObjectId,
      },
      {
        $set: {
          approved: false,
        },
      },
      { new: true }
    );

    if (!link) {
      return NextResponse.json({ error: 'Guardian link not found' }, { status: 404 });
    }

    await writeAuditLog({
      schoolId: schoolObjectId,
      userId: user.id,
      action: 'guardian.remove',
      entityType: 'GuardianLink',
      entityId: link._id,
      metadata: {
        studentId,
        visitorId: String(link.visitorId),
        approved: false,
      },
    });

    return NextResponse.json({ guardianLink: link }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
