import webpush from 'web-push';
import { Types } from 'mongoose';
import { PushSubscription } from '@/models/PushSubscription';
import {
  Notification,
  type INotification,
  type INotificationPayload,
  type NotificationType,
} from '@/models/Notification';
import { User } from '@/models/User';

let vapidConfigured = false;
let vapidWarningLogged = false;

export function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@gatesathi.in';

  if (!publicKey || !privateKey) {
    if (!vapidWarningLogged) {
      console.warn(
        '[Push] WARNING: VAPID_PUBLIC_KEY and/or VAPID_PRIVATE_KEY are missing. Push notifications cannot be dispatched and will be marked as failed ("VAPID not configured"). Run `npx web-push generate-vapid-keys` to generate them.'
      );
      vapidWarningLogged = true;
    }
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
  } catch (err) {
    console.warn('[Push] Error configuring VAPID details:', err);
    return false;
  }
}

interface NotifyOptions {
  schoolId?: Types.ObjectId | string;
  fallbackToPrincipalsIfNoSub?: boolean;
}

/**
 * Sends a single notification payload to an endpoint with 3s timeout.
 */
async function sendWithTimeout(
  sub: { endpoint: string; p256dh: string; auth: string },
  stringifiedPayload: string,
  timeoutMs = 3000
): Promise<void> {
  const sendPromise = webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    },
    stringifiedPayload,
    { timeout: timeoutMs }
  );

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`WebPush request timed out after ${timeoutMs}ms`)), timeoutMs)
  );

  await Promise.race([sendPromise, timeoutPromise]);
}

/**
 * Core notification dispatcher with outbox pattern.
 * Enqueues into Notification collection, attempts immediate delivery with 3s timeout,
 * and records status ('sent', 'failed', 'no_subscription', or 'queued').
 */
export async function notify(
  userIds: (Types.ObjectId | string)[] | Types.ObjectId | string,
  type: NotificationType,
  payload: INotificationPayload,
  dedupeKey: string,
  options?: NotifyOptions
): Promise<INotification[]> {
  const rawList = Array.isArray(userIds) ? userIds : [userIds];
  const uniqueUserIds = Array.from(new Set(rawList.map((id) => String(id))));
  const results: INotification[] = [];

  for (const rawUserId of uniqueUserIds) {
    const userObjectId = new Types.ObjectId(rawUserId);
    const resolvedDedupeKey =
      uniqueUserIds.length > 1 && !dedupeKey.endsWith(`:${rawUserId}`)
        ? `${dedupeKey}:${rawUserId}`
        : dedupeKey;

    // 1. Resolve schoolId
    let schoolObjectId: Types.ObjectId;
    if (options?.schoolId) {
      schoolObjectId = new Types.ObjectId(String(options.schoolId));
    } else {
      const user = await User.findById(userObjectId).select('schoolIds').lean();
      schoolObjectId =
        user?.schoolIds && user.schoolIds.length > 0 && user.schoolIds[0]
          ? new Types.ObjectId(String(user.schoolIds[0]))
          : new Types.ObjectId();
    }

    // 2. Check existing outbox notification for deduplication
    let notifDoc = await Notification.findOne({ dedupeKey: resolvedDedupeKey });
    if (notifDoc && notifDoc.status === 'sent') {
      results.push(notifDoc);
      continue;
    }

    if (!notifDoc) {
      notifDoc = await Notification.create({
        schoolId: schoolObjectId,
        userId: userObjectId,
        type,
        payload,
        status: 'queued',
        attempts: 0,
        nextAttemptAt: new Date(),
        dedupeKey: resolvedDedupeKey,
      });
    }

    // 3. Check push subscriptions
    const subscriptions = await PushSubscription.find({ userId: userObjectId });
    if (subscriptions.length === 0) {
      notifDoc.status = 'no_subscription';
      notifDoc.lastError = 'No push subscriptions registered for user';
      await notifDoc.save();
      results.push(notifDoc);

      // Task A4: If assigned user has 0 subscriptions and fallback is requested, notify principals
      if (options?.fallbackToPrincipalsIfNoSub) {
        try {
          const principals = await User.find({
            schoolIds: schoolObjectId,
            role: 'principal',
            isActive: true,
          })
            .select('_id')
            .lean();

          if (principals.length > 0) {
            const principalIds = principals.map((p) => p._id);
            await notify(
              principalIds,
              type,
              {
                ...payload,
                title: `${payload.title} (Teacher has no notifications)`,
                body: `${payload.body} [Teacher has not enabled notifications]`,
              },
              `${resolvedDedupeKey}:nosub_fallback`,
              {
                schoolId: schoolObjectId,
                fallbackToPrincipalsIfNoSub: false,
              }
            );
          }
        } catch (fbErr) {
          console.warn('[Push] Error in fallback to principals:', fbErr);
        }
      }
      continue;
    }

    // 4. Verify VAPID keys
    const isVapidReady = ensureVapidConfigured();
    if (!isVapidReady) {
      notifDoc.status = 'failed';
      notifDoc.attempts = (notifDoc.attempts || 0) + 1;
      notifDoc.lastError = 'VAPID not configured';
      await notifDoc.save();
      results.push(notifDoc);
      continue;
    }

    // 5. Attempt immediate send
    const stringifiedPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/teacher',
      icon: payload.icon || '/icons/icon-192.png',
    });

    let sentCount = 0;
    let lastErrorMsg: string | undefined;

    for (const sub of subscriptions) {
      try {
        await sendWithTimeout(sub, stringifiedPayload, 3000);
        sentCount++;
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          // Subscription expired or uninstalled
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          lastErrorMsg = err?.message || 'Push dispatch failed';
        }
      }
    }

    if (sentCount > 0) {
      notifDoc.status = 'sent';
      notifDoc.attempts = (notifDoc.attempts || 0) + 1;
      notifDoc.lastError = undefined;
    } else {
      // Check if subscriptions were cleared due to 404/410
      const remainingSubs = await PushSubscription.countDocuments({ userId: userObjectId });
      if (remainingSubs === 0) {
        notifDoc.status = 'no_subscription';
        notifDoc.lastError = 'All push subscriptions expired or unsubscribed';
      } else {
        notifDoc.status = 'failed';
        notifDoc.attempts = (notifDoc.attempts || 0) + 1;
        notifDoc.lastError = lastErrorMsg || 'Failed to dispatch to push endpoints';
        // Backoff: 2 min
        notifDoc.nextAttemptAt = new Date(Date.now() + 2 * 60 * 1000);
      }
    }

    await notifDoc.save();
    results.push(notifDoc);
  }

  return results;
}

/**
 * Retries queued and failed notifications from the outbox with backoff (up to 5 attempts).
 * Called by scheduled function notify-tick.
 */
export async function processNotificationOutbox(limit = 50): Promise<{
  processed: number;
  sent: number;
  failed: number;
  exhausted: number;
}> {
  const now = new Date();
  const pendingList = await Notification.find({
    status: { $in: ['queued', 'failed'] },
    attempts: { $lt: 5 },
    nextAttemptAt: { $lte: now },
  })
    .limit(limit)
    .sort({ nextAttemptAt: 1 });

  let sent = 0;
  let failed = 0;
  let exhausted = 0;

  for (const notif of pendingList) {
    const isVapidReady = ensureVapidConfigured();
    if (!isVapidReady) {
      notif.attempts += 1;
      notif.status = 'failed';
      notif.lastError = 'VAPID not configured';
      if (notif.attempts >= 5) exhausted++;
      await notif.save();
      failed++;
      continue;
    }

    const subscriptions = await PushSubscription.find({ userId: notif.userId });
    if (subscriptions.length === 0) {
      notif.status = 'no_subscription';
      notif.lastError = 'No push subscriptions found for user';
      await notif.save();
      continue;
    }

    const stringifiedPayload = JSON.stringify({
      title: notif.payload.title,
      body: notif.payload.body,
      url: notif.payload.url || '/teacher',
      icon: notif.payload.icon || '/icons/icon-192.png',
    });

    let sentSubCount = 0;
    let lastErr: string | undefined;

    for (const sub of subscriptions) {
      try {
        await sendWithTimeout(sub, stringifiedPayload, 3000);
        sentSubCount++;
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          lastErr = err?.message || 'Dispatch error';
        }
      }
    }

    notif.attempts += 1;

    if (sentSubCount > 0) {
      notif.status = 'sent';
      notif.lastError = undefined;
      sent++;
    } else {
      const remaining = await PushSubscription.countDocuments({ userId: notif.userId });
      if (remaining === 0) {
        notif.status = 'no_subscription';
        notif.lastError = 'All subscriptions invalid';
      } else {
        notif.status = 'failed';
        notif.lastError = lastErr || 'Retry dispatch failed';
        failed++;
        if (notif.attempts >= 5) {
          exhausted++;
        } else {
          // Exponential backoff: 2^attempts minutes (2m, 4m, 8m, 16m)
          const delayMinutes = Math.pow(2, notif.attempts);
          notif.nextAttemptAt = new Date(Date.now() + delayMinutes * 60 * 1000);
        }
      }
    }

    await notif.save();
  }

  return { processed: pendingList.length, sent, failed, exhausted };
}

/**
 * Backward-compatible thin wrapper for sending push notification to a single user.
 */
export async function sendNotificationToUser(
  userId: Types.ObjectId | string,
  payload: { title: string; body: string; url?: string; icon?: string },
  options?: NotifyOptions
): Promise<void> {
  const dedupeKey = `legacy:${String(userId)}:${Date.now()}`;
  await notify(userId, 'approval_request', payload, dedupeKey, options);
}

/**
 * Backward-compatible thin wrapper for sending push notification to school principals.
 */
export async function sendNotificationToSchoolPrincipals(
  schoolId: Types.ObjectId | string,
  payload: { title: string; body: string; url?: string; icon?: string },
  dedupeKeyPrefix = 'legacy_principals'
): Promise<void> {
  const schoolObjectId = new Types.ObjectId(String(schoolId));
  const principals = await User.find({
    schoolIds: schoolObjectId,
    role: 'principal',
    isActive: true,
  })
    .select('_id')
    .lean();

  if (principals.length === 0) return;

  const principalIds = principals.map((p) => p._id);
  const dedupeKey = `${dedupeKeyPrefix}:${String(schoolId)}:${Date.now()}`;
  await notify(principalIds, 'approval_request', payload, dedupeKey, {
    schoolId: schoolObjectId,
  });
}
