import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'approval_request',
  'approval_escalated',
  'approval_decided',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_STATUSES = [
  'queued',
  'sent',
  'failed',
  'no_subscription',
] as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export interface INotificationPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  [key: string]: unknown;
}

export interface INotification extends Document {
  schoolId: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  payload: INotificationPayload;
  status: NotificationStatus;
  attempts: number;
  lastError?: string;
  nextAttemptAt: Date;
  dedupeKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: NOTIFICATION_STATUSES,
      default: 'queued',
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastError: {
      type: String,
      trim: true,
    },
    nextAttemptAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    dedupeKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  { timestamps: true }
);

// Indexes
NotificationSchema.index({ schoolId: 1, status: 1, nextAttemptAt: 1 });
NotificationSchema.index({ userId: 1, status: 1 });
// TTL: Auto-delete 30 days after creation
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);

export const Notification: Model<INotification> =
  mongoose.models.Notification ||
  mongoose.model<INotification>('Notification', NotificationSchema);
