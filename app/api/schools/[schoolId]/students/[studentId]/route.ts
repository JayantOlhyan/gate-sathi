import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { objectIdSchema, studentUpdateBodySchema } from '@/lib/validations';
import { Student } from '@/models/Student';
import { GuardianLink } from '@/models/GuardianLink';
import '@/models/Visitor';

const paramsSchema = z.object({
  schoolId: z.string().trim().min(1),
  studentId: objectIdSchema,
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
    }).lean();

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const guardianLinks = await GuardianLink.find({
      schoolId: new Types.ObjectId(schoolId),
      studentId: new Types.ObjectId(studentId),
      approved: true,
    })
      .populate('visitorId', 'name phone photoUrl')
      .lean();

    const guardians = guardianLinks.map((link) => {
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

    return NextResponse.json({ student, guardians }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ schoolId: string; studentId: string }> }
) {
  try {
    const rawParams = await context.params;
    const { schoolId: requestedSchoolId, studentId } = paramsSchema.parse(rawParams);

    const user = await requireRole('principal', 'super_admin');
    const { schoolId } = await requireSchoolAccess(requestedSchoolId);

    const rawBody = await req.json();
    const updates = studentUpdateBodySchema.parse(rawBody);

    await connectDB();

    const updatedStudent = await Student.findOneAndUpdate(
      {
        _id: new Types.ObjectId(studentId),
        schoolId: new Types.ObjectId(schoolId),
      },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedStudent) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    await writeAuditLog({
      schoolId,
      userId: user.id,
      action: 'student.edit',
      entityType: 'Student',
      entityId: studentId,
      metadata: { updates },
    });

    return NextResponse.json({ student: updatedStudent }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
