import { runNotifyTick } from '../../lib/notify-tick';

// Scheduled function executing every minute
export const config = {
  schedule: '* * * * *',
};

export default async function notifyTickScheduledHandler() {
  const result = await runNotifyTick();
  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
