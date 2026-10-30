import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IRateLimit extends Document {
  key: string;
  count: number;
  windowStart: Date;
}

const RateLimitSchema = new Schema<IRateLimit>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    count: {
      type: Number,
      required: true,
      default: 1,
    },
    windowStart: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    collection: 'rateLimits',
    timestamps: false,
  }
);

RateLimitSchema.index({ key: 1 }, { unique: true });
RateLimitSchema.index({ windowStart: 1 }, { expireAfterSeconds: 900 });

export const RateLimit: Model<IRateLimit> =
  mongoose.models.RateLimit ||
  mongoose.model<IRateLimit>('RateLimit', RateLimitSchema);
