import { runAutoCloseVisits } from '../../lib/close-visits';

// Daily at 17:05 IST = 11:35 UTC
export const config = {
  schedule: '35 11 * * *',
};

export default async function closeVisitsScheduledHandler() {
  const result = await runAutoCloseVisits(new Date());
  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
