import { connectDB } from '@/lib/db';
import { School } from '@/models/School';
import { Visit } from '@/models/Visit';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5 hours 30 minutes

function parseClosingHour(closingHourIst?: string): { hour: number; minute: number } {
  if (!closingHourIst) return { hour: 17, minute: 0 };
  const [hStr, mStr] = closingHourIst.split(':');
  const h = Number(hStr ?? 17);
  const m = Number(mStr ?? 0);
  if (Number.isNaN(h) || Number.isNaN(m)) return { hour: 17, minute: 0 };
  return { hour: h, minute: m };
}

export function getClosingTimeForEntryDay(entryAt: Date, closingHourIst?: string): Date {
  const { hour, minute } = parseClosingHour(closingHourIst);
  // Convert entryAt to IST calendar date (year, month, day)
  const entryIst = new Date(entryAt.getTime() + IST_OFFSET_MS);
  const y = entryIst.getUTCFullYear();
  const m = entryIst.getUTCMonth();
  const d = entryIst.getUTCDate();

  // Closing time on that ENTRY day in IST converted back to UTC
  return new Date(Date.UTC(y, m, d, hour - 5, minute - 30, 0, 0));
}

export async function runAutoCloseVisits(now: Date = new Date()): Promise<{
  closedCount: number;
}> {
  await connectDB();

  const schools = await School.find({ isActive: true })
    .select('_id closingHourIst')
    .lean();

  let closedCount = 0;

  for (const school of schools) {
    const openVisits = await Visit.find({
      schoolId: school._id,
      exitAt: null,
    }).select('_id entryAt');

    for (const visit of openVisits) {
      const closingTimeOnEntryDay = getClosingTimeForEntryDay(
        visit.entryAt,
        school.closingHourIst
      );

      // Close open visits whose entry day (IST) has passed that school's closingHourIst
      if (now.getTime() >= closingTimeOnEntryDay.getTime()) {
        const updateRes = await Visit.updateOne(
          { _id: visit._id, exitAt: null },
          {
            $set: {
              exitAt: closingTimeOnEntryDay,
              autoClosed: true,
            },
          }
        );
        closedCount += updateRes.modifiedCount ?? 0;
      }
    }
  }

  return { closedCount };
}
