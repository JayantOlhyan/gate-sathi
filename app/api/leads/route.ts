import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { MongoRateLimiter } from '@/lib/rate-limit';
import { leadCreateBodySchema } from '@/lib/validations';
import { Lead } from '@/models/Lead';

const LEADS_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const LEADS_MAX_PER_IP = 5;

const mongoRateLimiter = new MongoRateLimiter();

export async function POST(request: NextRequest) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip =
      forwardedFor?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip')?.trim() ||
      '127.0.0.1';

    let rawBody: Record<string, unknown>;
    try {
      rawBody = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    // Honeypot check: if bot filled hidden honeypot/website field, reject silently
    const honeypotValue = String(
      rawBody?.honeypot ?? rawBody?.website ?? ''
    ).trim();
    if (honeypotValue.length > 0) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

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

    const parsed = leadCreateBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
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
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
