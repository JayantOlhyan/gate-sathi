import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { objectIdSchema, teacherUpdateBodySchema } from '@/lib/validations';
import { User } from '@/models/User';

const paramsSchema = z.object({
  schoolId: z.string().trim().min(1),
  teacherId: objectIdSchema,
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ schoolId: string; teacherId: string }> }
) {
  try {
    const rawParams = await context.params;
    const { schoolId: requestedSchoolId, teacherId } = paramsSchema.parse(rawParams);

    const user = await requireRole('principal', 'super_admin');
    const { schoolId } = await requireSchoolAccess(requestedSchoolId);

    const rawBody = await req.json();
    const body = teacherUpdateBodySchema.parse(rawBody);

    await connectDB();

    const schoolObjectId = new Types.ObjectId(schoolId);
    const teacherObjectId = new Types.ObjectId(teacherId);
    const callerObjectId = Types.ObjectId.isValid(user.id)
      ? new Types.ObjectId(user.id)
      : new Types.ObjectId();

    const teacher = await User.findOne({
      _id: teacherObjectId,
      schoolIds: schoolObjectId,
      role: 'teacher',
    });

    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }

    const updateSet: Record<string, unknown> = {};

    if (typeof body.isActive === 'boolean') {
      teacher.isActive = body.isActive;
      if (!body.isActive) {
        teacher.tokenVersion = (teacher.tokenVersion ?? 0) + 1;
      }
    }

    if (Array.isArray(body.classAssignments)) {
      teacher.classAssignments = body.classAssignments.map((ca) => ({
        schoolId: schoolObjectId,
        className: ca.className.trim(),
        section: ca.section.trim().toUpperCase(),
      })) as any;
    }

    await teacher.save();

    await writeAuditLog({
      schoolId: schoolObjectId,
      userId: callerObjectId,
      action: typeof body.isActive === 'boolean' && !body.isActive ? 'teacher.deactivate' : 'teacher.update',
      entityType: 'User',
      entityId: teacher._id,
      metadata: {
        teacherId: String(teacher._id),
        isActive: teacher.isActive,
        classAssignments: teacher.classAssignments,
      },
    });

    return NextResponse.json({ teacher }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
