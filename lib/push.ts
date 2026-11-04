import webpush from 'web-push';
import { Types } from 'mongoose';
import { PushSubscription } from '@/models/PushSubscription';
import { User } from '@/models/User';

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@gatesathi.in';

  if (!publicKey || !privateKey) {
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

export async function sendNotificationToUser(
  userId: Types.ObjectId | string,
  payload: { title: string; body: string; url?: string; icon?: string }
): Promise<void> {
  if (!ensureVapidConfigured()) {
    return;
  }

  try {
    const userObjectId = new Types.ObjectId(userId);
    const subscriptions = await PushSubscription.find({ userId: userObjectId }).lean();

    const stringifiedPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/teacher',
      icon: payload.icon || '/icons/icon-192.png',
    });

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            stringifiedPayload
          );
        } catch (error: any) {
          if (error?.statusCode === 410 || error?.statusCode === 404) {
            // Subscription expired or unsubscribed on browser side
            await PushSubscription.deleteOne({ _id: sub._id });
          }
        }
      })
    );
  } catch (err) {
    console.warn('[Push] Failed to send push notification to user:', err);
  }
}

export async function sendNotificationToSchoolPrincipals(
  schoolId: Types.ObjectId | string,
  payload: { title: string; body: string; url?: string; icon?: string }
): Promise<void> {
  try {
    const schoolObjectId = new Types.ObjectId(schoolId);
    const principals = await User.find({
      schoolIds: schoolObjectId,
      role: 'principal',
      isActive: true,
    })
      .select('_id')
      .lean();

    await Promise.allSettled(
      principals.map((p) => sendNotificationToUser(p._id, payload))
    );
  } catch (err) {
    console.warn('[Push] Failed to send notification to principals:', err);
  }
}
