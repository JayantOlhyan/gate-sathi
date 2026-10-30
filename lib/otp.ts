import crypto from 'crypto';
import { Types } from 'mongoose';
import { OtpRequest } from '@/models/OtpRequest';

export const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
export const OTP_HOURLY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const OTP_MAX_SENDS_PER_HOUR = 3;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;

export class OtpError extends Error {
  status: 400 | 429;
  constructor(message: string, status: 400 | 429 = 400) {
    super(message);
    this.name = 'OtpError';
    this.status = status;
  }
}

export interface OtpProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}

export class MockOtpProvider implements OtpProvider {
  async sendOtp(phone: string, code: string): Promise<void> {
    console.info(`[MockOtpProvider] OTP for ${phone}: ${code} (or 000000 in mock mode)`);
  }
}

export class Msg91OtpProvider implements OtpProvider {
  private authKey: string;
  private templateId: string;

  constructor(
    authKey = process.env.MSG91_AUTH_KEY ?? '',
    templateId = process.env.MSG91_TEMPLATE_ID ?? ''
  ) {
    this.authKey = authKey;
    this.templateId = templateId;
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    if (!this.authKey || !this.templateId) {
      throw new Error('MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required for Msg91OtpProvider');
    }
    const response = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: this.authKey,
      },
      body: JSON.stringify({
        template_id: this.templateId,
        mobile: `91${phone}`,
        otp: code,
      }),
    });
    if (!response.ok) {
      throw new Error(`MSG91 OTP send failed with status ${response.status}`);
    }
  }
}

export function assertOtpModeSafe(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  otpMode: string | undefined = process.env.OTP_MODE
): void {
  if (nodeEnv === 'production' && otpMode === 'mock') {
    throw new Error('OTP_MODE=mock is forbidden when NODE_ENV=production');
  }
}

// Validate at module startup
assertOtpModeSafe();

export function getOtpProvider(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  otpMode: string | undefined = process.env.OTP_MODE
): OtpProvider {
  assertOtpModeSafe(nodeEnv, otpMode);
  if (otpMode === 'mock') {
    return new MockOtpProvider();
  }
  return new Msg91OtpProvider();
}

export function hashOtpCode(code: string, salt?: string): string {
  const actualSalt = salt ?? crypto.randomBytes(16).toString('hex');
  const digest = crypto
    .createHash('sha256')
    .update(`${actualSalt}:${code}`)
    .digest('hex');
  return `${actualSalt}:${digest}`;
}

export function verifyHashedOtpCode(code: string, storedCodeHash: string): boolean {
  const [salt, expectedDigest] = storedCodeHash.split(':');
  if (!salt || !expectedDigest) {
    return false;
  }
  const actualHash = hashOtpCode(code, salt);
  const [, actualDigest] = actualHash.split(':');
  if (!actualDigest || actualDigest.length !== expectedDigest.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(actualDigest, 'hex'),
    Buffer.from(expectedDigest, 'hex')
  );
}

export function generateSixDigitOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export async function sendOtpForVisitor(params: {
  schoolId: string | Types.ObjectId;
  phone: string;
  nowMs?: number;
  provider?: OtpProvider;
  nodeEnv?: string;
  otpMode?: string;
}): Promise<{ expiresAt: Date }> {
  const nowMs = params.nowMs ?? Date.now();
  const schoolObjectId = new Types.ObjectId(String(params.schoolId));
  const phone = params.phone.trim();

  assertOtpModeSafe(params.nodeEnv, params.otpMode);

  // Max 3 sends per phone per hour
  const oneHourAgo = new Date(nowMs - OTP_HOURLY_WINDOW_MS);
  const recentSends = await OtpRequest.countDocuments({
    schoolId: schoolObjectId,
    phone,
    createdAt: { $gte: oneHourAgo },
  });

  if (recentSends >= OTP_MAX_SENDS_PER_HOUR) {
    throw new OtpError(
      'Maximum 3 OTP requests per phone per hour exceeded',
      429
    );
  }

  // Invalidate any prior active OTP requests for this phone
  await OtpRequest.updateMany(
    { schoolId: schoolObjectId, phone, invalidated: false },
    { $set: { invalidated: true } }
  );

  const code = generateSixDigitOtp();
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(nowMs + OTP_EXPIRY_MS);

  await OtpRequest.create({
    schoolId: schoolObjectId,
    phone,
    codeHash,
    expiresAt,
    attempts: 0,
    invalidated: false,
    createdAt: new Date(nowMs),
  });

  const provider =
    params.provider ?? getOtpProvider(params.nodeEnv, params.otpMode);
  await provider.sendOtp(phone, code);

  return { expiresAt };
}

export async function verifyOtpForVisitor(params: {
  schoolId: string | Types.ObjectId;
  phone: string;
  code: string;
  nowMs?: number;
  nodeEnv?: string;
  otpMode?: string;
}): Promise<{ verified: true; verifiedAt: Date }> {
  const nowMs = params.nowMs ?? Date.now();
  const nodeEnv = params.nodeEnv ?? process.env.NODE_ENV;
  const otpMode = params.otpMode ?? process.env.OTP_MODE;

  assertOtpModeSafe(nodeEnv, otpMode);

  const schoolObjectId = new Types.ObjectId(String(params.schoolId));
  const phone = params.phone.trim();
  const code = params.code.trim();

  const otpReq = await OtpRequest.findOne({
    schoolId: schoolObjectId,
    phone,
  }).sort({ createdAt: -1 });

  if (!otpReq) {
    throw new OtpError('No OTP request found for this phone number', 400);
  }

  if (otpReq.invalidated || otpReq.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    throw new OtpError(
      'Maximum OTP verification attempts exceeded; please request a new OTP',
      429
    );
  }

  if (otpReq.expiresAt.getTime() <= nowMs) {
    otpReq.invalidated = true;
    await otpReq.save();
    throw new OtpError('OTP has expired', 400);
  }

  const isMockAccept =
    otpMode === 'mock' && nodeEnv !== 'production' && code === '000000';
  const isCodeValid =
    isMockAccept || verifyHashedOtpCode(code, otpReq.codeHash);

  if (!isCodeValid) {
    otpReq.attempts += 1;
    if (otpReq.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      otpReq.invalidated = true;
    }
    await otpReq.save();
    throw new OtpError('Invalid OTP code', 400);
  }

  const verifiedAt = new Date(nowMs);
  otpReq.verifiedAt = verifiedAt;
  otpReq.invalidated = true;
  await otpReq.save();

  return { verified: true, verifiedAt };
}
