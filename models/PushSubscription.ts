import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export interface IPushSubscription extends Document {
  userId: Types.ObjectId;
  schoolId: Types.ObjectId;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
  updatedAt: Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    endpoint: {
      type: String,
      required: true,
      trim: true,
    },
    p256dh: {
      type: String,
      required: true,
      trim: true,
    },
    auth: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

PushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });
PushSubscriptionSchema.index({ schoolId: 1 });

export const PushSubscription: Model<IPushSubscription> =
  mongoose.models.PushSubscription ||
  mongoose.model<IPushSubscription>('PushSubscription', PushSubscriptionSchema);
