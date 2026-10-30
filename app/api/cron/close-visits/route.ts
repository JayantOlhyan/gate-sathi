import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { School } from '@/models/School';
import { Visit } from '@/models/Visit';

function parseHhMmToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr ?? 17);
  const m = Number(mStr ?? 0);
  if (Number.isNaN(h) || Number.isNaN(m)) return 17 * 60;
  return h * 60 + m;
}

function getCurrentIstMinutes(now: Date): number {
  // IST is UTC + 5:30 (+330 minutes)
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utcMinutes + 330) % (24 * 60);
}

export async function runAutoCloseVisits(now: Date = new Date()): Promise<{
  closedCount: number;
}> {
  await connectDB();

  const schools = await School.find({ isActive: true })
    .select('_id closingHourIst')
    .lean();

  const currentIstMins = getCurrentIstMinutes(now);
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);

  let closedCount = 0;

  for (const school of schools) {
    const closingMins = parseHhMmToMinutes(school.closingHourIst || '17:00');
    const isPastClosingToday = currentIstMins >= closingMins;

    const filter: Record<string, unknown> = {
      schoolId: school._id,
      exitAt: null,
    };

    if (!isPastClosingToday) {
      // Before today's closing hour, only auto-close leftover open visits from previous days
      filter.entryAt = { $lt: startOfToday };
    }

    const result = await Visit.updateMany(filter, {
      $set: {
        exitAt: now,
        autoClosed: true,
      },
    });

    closedCount += result.modifiedCount ?? 0;
  }

  return { closedCount };
}

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
