import { NextResponse, type NextRequest } from 'next/server';
import { getClientIp } from '@/lib/client-ip';
import { connectDB } from '@/lib/db';
import { MongoRateLimiter } from '@/lib/rate-limit';
import { leadCreateBodySchema } from '@/lib/validations';
import { Lead } from '@/models/Lead';

const LEADS_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const LEADS_MAX_PER_IP = 5;

const mongoRateLimiter = new MongoRateLimiter();

export async function POST(request: NextRequest) {
  // 1. Parse JSON body
  let rawBody: Record<string, unknown>;
  try {
    rawBody = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request body' },
      { status: 400 }
    );
  }

  // 2. Honeypot check: if bot filled hidden honeypot/website field, return success without touching DB
  const honeypotValue = String(
    rawBody?.honeypot ?? rawBody?.website ?? ''
  ).trim();
  if (honeypotValue.length > 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // 3. Validate body before touching DB or rate limiter
  const parsed = leadCreateBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // 4. Rate-limit and persist in DB; if DB or rate limiter is down, return friendly 503
  try {
    const ip = getClientIp(request.headers);

    const rateResult = await mongoRateLimiter.consume(
      `leads:ip:${ip}`,
      LEADS_MAX_PER_IP,
      LEADS_WINDOW_MS
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    await connectDB();
    const created = await Lead.create({
      name: parsed.data.name,
      schoolName: parsed.data.schoolName,
      role: parsed.data.role,
      phone: parsed.data.phone,
      message: parsed.data.message ?? '',
      ip,
    });

    return NextResponse.json(
      { ok: true, id: String(created._id) },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        error:
          'Service temporarily unavailable. Please try again later or contact us directly.',
      },
      { status: 503 }
    );
  }
}
