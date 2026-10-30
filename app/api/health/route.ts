import { NextResponse, type NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { getClientIp } from '@/lib/client-ip';
import { connectDB } from '@/lib/db';
import { checkR2Health } from '@/lib/r2';
import { isMockOtpActive } from '@/lib/otp';
import {
  getRateLimiter,
  InMemoryRateLimiter,
  LOGIN_WINDOW_MS,
} from '@/lib/rate-limit';

const HEALTH_RATE_LIMIT_MAX = 30;
const fallbackHealthLimiter = new InMemoryRateLimiter();

export async function GET(req: NextRequest) {
  const ip = getClientIp(req.headers);
  let rateAllowed = true;
  try {
    const limiter = getRateLimiter();
    const rateCheck = await limiter.consume(
      `health:ip:${ip}`,
      HEALTH_RATE_LIMIT_MAX,
      LOGIN_WINDOW_MS
    );
    rateAllowed = rateCheck.allowed;
  } catch {
    const fallbackCheck = await fallbackHealthLimiter.consume(
      `health:ip:${ip}`,
      HEALTH_RATE_LIMIT_MAX,
      LOGIN_WINDOW_MS
    );
    rateAllowed = fallbackCheck.allowed;
  }

  if (!rateAllowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    );
  }

  let dbStatus: 'ok' | 'error' = 'error';
  try {
    await connectDB();
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db?.admin().ping();
      dbStatus = 'ok';
    }
  } catch {
    dbStatus = 'error';
  }

  const r2Status = await checkR2Health();
  const otpMode = isMockOtpActive()
    ? 'mock'
    : process.env.OTP_MODE === 'msg91'
      ? 'msg91'
      : 'disabled';

  return NextResponse.json(
    {
      db: dbStatus,
      r2: r2Status,
      otpMode,
    },
    { status: 200 }
  );
}
