import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { verifyOtpForVisitor } from '@/lib/otp';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { otpVerifyBodySchema } from '@/lib/validations';

export async function POST(req: NextRequest) {
  try {
    await requireRole('guard', 'principal', 'super_admin');

    const rawBody = await req.json();
    const body = otpVerifyBodySchema.parse(rawBody);
    const { schoolId } = await requireSchoolAccess(body.schoolId);

    await connectDB();
    const result = await verifyOtpForVisitor({
      schoolId,
      phone: body.phone,
      code: body.code,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
