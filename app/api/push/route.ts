import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { auth } from '@/auth';
import { connectDB } from '@/lib/db';
import { handleApiError, RbacError } from '@/lib/rbac';
import { pushSubscriptionBodySchema } from '@/lib/validations';
import { PushSubscription } from '@/models/PushSubscription';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const user = session?.user;
    if (!user || !user.id) {
      throw new RbacError('Unauthorized', 401);
    }

    const rawBody = await req.json();
    const body = pushSubscriptionBodySchema.parse(rawBody);

    await connectDB();

    const userObjectId = new Types.ObjectId(user.id);
    const schoolObjectId = user.schoolIds?.[0]
      ? new Types.ObjectId(user.schoolIds[0])
      : new Types.ObjectId();

    await PushSubscription.findOneAndUpdate(
      {
        userId: userObjectId,
        endpoint: body.endpoint,
      },
      {
        $set: {
          userId: userObjectId,
          schoolId: schoolObjectId,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    const user = session?.user;
    if (!user || !user.id) {
      throw new RbacError('Unauthorized', 401);
    }

    const rawBody = await req.json();
    const { endpoint } = rawBody;
    if (!endpoint || typeof endpoint !== 'string') {
      return NextResponse.json({ error: 'Endpoint is required' }, { status: 400 });
    }

    await connectDB();

    await PushSubscription.deleteOne({
      userId: new Types.ObjectId(user.id),
      endpoint,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
