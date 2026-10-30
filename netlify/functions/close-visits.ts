import { runAutoCloseVisits } from '../../lib/close-visits';

// Hourly scheduled function
export const config = {
  schedule: '0 * * * *',
};

export default async function closeVisitsScheduledHandler() {
  const result = await runAutoCloseVisits(new Date());
  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
