import { connectDB } from '@/lib/db';
import {
  checkAndEscalatePendingRequests,
  checkAndExpireStaleRequests,
} from '@/lib/escalate-approvals';
import { processNotificationOutbox } from '@/lib/push';

export async function runNotifyTick(): Promise<{
  escalatedCount: number;
  expiredCount: number;
  outbox: {
    processed: number;
    sent: number;
    failed: number;
    exhausted: number;
  };
}> {
  await connectDB();

  // (a) escalate overdue requests
  const escalatedCount = await checkAndEscalatePendingRequests();

  // (b) expire stale requests
  const expiredCount = await checkAndExpireStaleRequests();

  // (c) retry queued and failed push notifications
  const outbox = await processNotificationOutbox();

  return {
    escalatedCount,
    expiredCount,
    outbox,
  };
}
