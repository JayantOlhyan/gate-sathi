import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { createPresignedGetUrl, createPresignedPutUrl } from '@/lib/r2';
import { uploadSignBodySchema } from '@/lib/validations';

const getQuerySchema = z.object({
  schoolId: z.string().trim().min(1),
  photoKey: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  try {
    await requireRole('guard', 'principal', 'super_admin');

    const rawBody = await req.json();
    const body = uploadSignBodySchema.parse(rawBody);
    const { schoolId } = await requireSchoolAccess(body.schoolId);

    const signed = await createPresignedPutUrl({
      schoolId,
      contentType: body.contentType,
      contentLength: body.contentLength,
    });

    return NextResponse.json(signed, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireRole('guard', 'principal', 'super_admin');

    const { searchParams } = new URL(req.url);
    const query = getQuerySchema.parse({
      schoolId: searchParams.get('schoolId') ?? '',
      photoKey: searchParams.get('photoKey') ?? '',
    });

    const { schoolId } = await requireSchoolAccess(query.schoolId);
    const signedUrl = await createPresignedGetUrl({
      schoolId,
      photoKey: query.photoKey,
    });

    return NextResponse.json({ signedUrl }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
