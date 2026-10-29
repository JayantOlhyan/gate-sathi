import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { Student } from '@/models/Student';

const paramsSchema = z.object({
  schoolId: z.string().trim().min(1),
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ schoolId: string }> }
) {
  try {
    const rawParams = await context.params;
    const { schoolId: requestedSchoolId } = paramsSchema.parse(rawParams);

    await requireRole('super_admin', 'principal', 'guard');
    const { schoolId } = await requireSchoolAccess(requestedSchoolId);

    await connectDB();
    const students = await Student.find({ schoolId, isActive: true })
      .select('admissionNo name className section rollNumber schoolId')
      .lean();

    return NextResponse.json({ schoolId, students }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
