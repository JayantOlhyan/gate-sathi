import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';

const querySchema = z.object({
  schoolId: z.string().trim().min(1).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole('super_admin', 'principal');

    const { searchParams } = new URL(req.url);
    const parsedQuery = querySchema.parse({
      schoolId: searchParams.get('schoolId') ?? undefined,
    });

    const targetSchoolId = parsedQuery.schoolId ?? user.schoolIds[0];
    if (targetSchoolId) {
      await requireSchoolAccess(targetSchoolId);
    }

    return NextResponse.json(
      {
        status: 'ok',
        role: user.role,
        schoolId: targetSchoolId ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
