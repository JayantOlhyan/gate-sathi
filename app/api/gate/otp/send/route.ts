import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { sendOtpForVisitor } from '@/lib/otp';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { otpSendBodySchema } from '@/lib/validations';

export async function POST(req: NextRequest) {
  try {
    await requireRole('guard', 'principal', 'super_admin');

    const rawBody = await req.json();
    const body = otpSendBodySchema.parse(rawBody);
    const { schoolId } = await requireSchoolAccess(body.schoolId);

    await connectDB();
    const result = await sendOtpForVisitor({
      schoolId,
      phone: body.phone,
    });

    return NextResponse.json(
      { sent: true, expiresAt: result.expiresAt },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
