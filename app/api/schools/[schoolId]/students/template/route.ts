import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { generateStudentTemplateCsv } from '@/lib/student-import';
import { localeSchema } from '@/lib/validations';

const paramsSchema = z.object({
  schoolId: z.string().trim().min(1),
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ schoolId: string }> }
) {
  try {
    const rawParams = await context.params;
    const { schoolId: requestedSchoolId } = paramsSchema.parse(rawParams);

    await requireRole('principal', 'super_admin');
    await requireSchoolAccess(requestedSchoolId);

    const { searchParams } = new URL(req.url);
    const parsedLocale = localeSchema.safeParse(searchParams.get('locale') ?? 'en');
    const locale = parsedLocale.success ? parsedLocale.data : 'en';

    const csv = generateStudentTemplateCsv(locale);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="gatesathi-students-template-${locale}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
