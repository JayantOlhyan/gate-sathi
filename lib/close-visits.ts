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
