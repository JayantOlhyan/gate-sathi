import { NextResponse, type NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { checkR2Health } from '@/lib/r2';
import { isMockOtpActive } from '@/lib/otp';
import { getRateLimiter, LOGIN_WINDOW_MS } from '@/lib/rate-limit';

export const HEALTH_RATE_LIMIT_MAX = 30;

function extractClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return '127.0.0.1';
}

export async function GET(req: NextRequest) {
  const ip = extractClientIp(req);
  const limiter = getRateLimiter();
  const rateCheck = await limiter.consume(
    `health:ip:${ip}`,
    HEALTH_RATE_LIMIT_MAX,
    LOGIN_WINDOW_MS
  );

  if (!rateCheck.allowed) {
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
