import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { teacherCreateBodySchema } from '@/lib/validations';
import { User } from '@/models/User';

const paramsSchema = z.object({
  schoolId: z.string().trim().min(1),
});

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ schoolId: string }> }
) {
  try {
    const rawParams = await context.params;
    const { schoolId: requestedSchoolId } = paramsSchema.parse(rawParams);

    await requireRole('principal', 'super_admin');
    const { schoolId } = await requireSchoolAccess(requestedSchoolId);

    await connectDB();

    const schoolObjectId = new Types.ObjectId(schoolId);
    const teachers = await User.find({
      schoolIds: schoolObjectId,
      role: 'teacher',
    })
      .select('_id name phone role classAssignments isActive createdAt')
      .sort({ name: 1 })
      .lean();

    return NextResponse.json(
      {
        schoolId,
        teachers: teachers.map((t) => ({
          ...t,
          _id: String(t._id),
          classAssignments: (t.classAssignments || []).filter(
            (ca) => String(ca.schoolId) === schoolId
          ),
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ schoolId: string }> }
) {
  try {
    const rawParams = await context.params;
    const { schoolId: requestedSchoolId } = paramsSchema.parse(rawParams);

    const user = await requireRole('principal', 'super_admin');
    const { schoolId } = await requireSchoolAccess(requestedSchoolId);

    const rawBody = await req.json();
    const body = teacherCreateBodySchema.parse(rawBody);

    await connectDB();

    const schoolObjectId = new Types.ObjectId(schoolId);
    const callerObjectId = Types.ObjectId.isValid(user.id)
      ? new Types.ObjectId(user.id)
      : new Types.ObjectId();

    const normalizedNewName = normalizeName(body.name);
    const existingUser = await User.findOne({ phone: body.phone });

    const newAssignment = {
      schoolId: schoolObjectId,
      className: body.className.trim(),
      section: body.section.trim().toUpperCase(),
    };

    if (existingUser) {
      const normalizedExistingName = normalizeName(existingUser.name);
      if (normalizedExistingName !== normalizedNewName) {
        if (!body.conflictResolution) {
          return NextResponse.json(
            {
              error: 'Phone already registered with different name',
              existingName: existingUser.name,
              enteredName: body.name,
            },
            { status: 409 }
          );
        }

        if (body.conflictResolution === 'update_name') {
          const oldName = existingUser.name;
          existingUser.name = body.name.trim();
          await writeAuditLog({
            schoolId: schoolObjectId,
            userId: callerObjectId,
            action: 'teacher.name_update',
            entityType: 'User',
            entityId: existingUser._id,
            metadata: {
              phone: body.phone,
              oldName,
              newName: body.name.trim(),
            },
          });
        }
      }

      // Add schoolId if missing
      if (!existingUser.schoolIds.some((sId) => String(sId) === schoolId)) {
        existingUser.schoolIds.push(schoolObjectId);
      }

      if (existingUser.role !== 'super_admin' && existingUser.role !== 'principal') {
        existingUser.role = 'teacher';
      }

      // Add classAssignment if not duplicate
      const currentAssignments = existingUser.classAssignments || [];
      const isDuplicate = currentAssignments.some(
        (ca) =>
          String(ca.schoolId) === schoolId &&
          ca.className === newAssignment.className &&
          ca.section === newAssignment.section
      );

      if (!isDuplicate) {
        currentAssignments.push(newAssignment as any);
        existingUser.classAssignments = currentAssignments;
      }

      existingUser.isActive = true;
      await existingUser.save();

      await writeAuditLog({
        schoolId: schoolObjectId,
        userId: callerObjectId,
        action: 'teacher.assign',
        entityType: 'User',
        entityId: existingUser._id,
        metadata: {
          phone: body.phone,
          className: newAssignment.className,
          section: newAssignment.section,
        },
      });

      return NextResponse.json({ teacher: existingUser }, { status: 200 });
    }

    // New teacher creation
    const passwordHash = await bcrypt.hash('Password@123', 10);
    const newTeacher = await User.create({
      name: body.name.trim(),
      phone: body.phone,
      passwordHash,
      role: 'teacher',
      schoolIds: [schoolObjectId],
      classAssignments: [newAssignment],
      tokenVersion: 0,
      isActive: true,
    });

    await writeAuditLog({
      schoolId: schoolObjectId,
      userId: callerObjectId,
      action: 'teacher.create',
      entityType: 'User',
      entityId: newTeacher._id,
      metadata: {
        name: newTeacher.name,
        phone: newTeacher.phone,
        className: newAssignment.className,
        section: newAssignment.section,
      },
    });

    return NextResponse.json({ teacher: newTeacher }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
