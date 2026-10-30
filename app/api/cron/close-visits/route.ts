import { NextResponse, type NextRequest } from 'next/server';
import { runAutoCloseVisits } from '@/lib/close-visits';

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const cronHeader = req.headers.get('x-cron-secret');
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : null;
  const providedSecret = bearerToken ?? cronHeader;

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json(
      { error: 'Unauthorized: invalid CRON_SECRET' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const rawNow = searchParams.get('now');
  const now = rawNow ? new Date(rawNow) : new Date();

  const result = await runAutoCloseVisits(now);
  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}
