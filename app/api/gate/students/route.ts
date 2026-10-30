import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { Student } from '@/models/Student';

const querySchema = z.object({
  schoolId: z.string().trim().min(1),
  q: z.string().trim().optional().default(''),
});

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(req: NextRequest) {
  try {
    await requireRole('guard', 'principal', 'super_admin');

    const { searchParams } = new URL(req.url);
    const query = querySchema.parse({
      schoolId: searchParams.get('schoolId') ?? '',
      q: searchParams.get('q') ?? '',
    });

    const { schoolId } = await requireSchoolAccess(query.schoolId);
    await connectDB();

    const filter: Record<string, unknown> = {
      schoolId: new Types.ObjectId(schoolId),
      isActive: true,
    };

    if (query.q) {
      const regex = new RegExp(escapeRegex(query.q), 'i');
      filter.$or = [
        { name: regex },
        { admissionNo: regex },
        { className: regex },
      ];
    }

    const students = await Student.find(filter)
      .sort({ className: 1, section: 1, name: 1 })
      .limit(25)
      .select('admissionNo name className section rollNumber')
      .lean();

    return NextResponse.json({ students }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
