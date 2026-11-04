import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import {
  studentCreateBodySchema,
  studentListQuerySchema,
} from '@/lib/validations';
import { Student } from '@/models/Student';

const paramsSchema = z.object({
  schoolId: z.string().trim().min(1),
});

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ schoolId: string }> }
) {
  try {
    const rawParams = await context.params;
    const { schoolId: requestedSchoolId } = paramsSchema.parse(rawParams);

    const user = await requireRole('principal', 'super_admin', 'teacher');
    const { schoolId } = await requireSchoolAccess(requestedSchoolId);

    const { searchParams } = new URL(req.url);
    const query = studentListQuerySchema.parse({
      q: searchParams.get('q') ?? undefined,
      className: searchParams.get('className') ?? undefined,
      section: searchParams.get('section') ?? undefined,
      includeInactive: searchParams.get('includeInactive') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    await connectDB();

    const filter: Record<string, unknown> = {
      schoolId: new Types.ObjectId(schoolId),
    };
    if (!query.includeInactive) {
      filter.isActive = true;
    }

    if (user.role === 'teacher') {
      const assignments = (user.classAssignments || []).filter(
        (a) => String(a.schoolId) === String(schoolId)
      );
      if (assignments.length === 0) {
        return NextResponse.json(
          {
            schoolId,
            students: [],
            pagination: { page: 1, limit: query.limit, total: 0, totalPages: 1 },
          },
          { status: 200 }
        );
      }

      if (query.className && query.section) {
        const hasMatch = assignments.some(
          (a) =>
            a.className === query.className &&
            a.section.toUpperCase() === query.section?.toUpperCase()
        );
        if (!hasMatch) {
          return NextResponse.json(
            { error: 'Forbidden: teacher not assigned to this class and section' },
            { status: 403 }
          );
        }
        filter.className = query.className;
        filter.section = query.section;
      } else if (query.className) {
        const matchingSections = assignments
          .filter((a) => a.className === query.className)
          .map((a) => a.section);
        if (matchingSections.length === 0) {
          return NextResponse.json(
            { error: 'Forbidden: teacher not assigned to this class' },
            { status: 403 }
          );
        }
        filter.className = query.className;
        filter.section = { $in: matchingSections };
      } else {
        filter.$or = assignments.map((a) => ({
          className: a.className,
          section: a.section,
        }));
      }
    } else {
      if (query.className) {
        filter.className = query.className;
      }
      if (query.section) {
        filter.section = query.section;
      }
    }
    if (query.q) {
      const regex = new RegExp(escapeRegex(query.q), 'i');
      filter.$or = [{ name: regex }, { admissionNo: regex }];
    }

    const skip = (query.page - 1) * query.limit;
    const [students, total] = await Promise.all([
      Student.find(filter)
        .sort({ className: 1, section: 1, admissionNo: 1 })
        .skip(skip)
        .limit(query.limit)
        .select('admissionNo name className section rollNumber isActive schoolId')
        .lean(),
      Student.countDocuments(filter),
    ]);

    return NextResponse.json(
      {
        schoolId,
        students,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        },
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
    const body = studentCreateBodySchema.parse(rawBody);

    await connectDB();

    const student = await Student.create({
      schoolId: new Types.ObjectId(schoolId),
      admissionNo: body.admissionNo,
      name: body.name,
      className: body.className,
      section: body.section,
      rollNumber: body.rollNumber ?? '',
      isActive: true,
    });

    await writeAuditLog({
      schoolId,
      userId: user.id,
      action: 'student.edit',
      entityType: 'Student',
      entityId: student._id,
      metadata: {
        operation: 'create',
        admissionNo: student.admissionNo,
        name: student.name,
      },
    });

    return NextResponse.json({ student }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
