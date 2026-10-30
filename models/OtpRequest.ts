import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export interface IOtpRequest extends Document {
  schoolId: Types.ObjectId;
  phone: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  invalidated: boolean;
  verifiedAt?: Date | null;
  createdAt: Date;
}

const OtpRequestSchema = new Schema<IOtpRequest>(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    codeHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      required: true,
      default: 0,
    },
    invalidated: {
      type: Boolean,
      required: true,
      default: false,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    collection: 'otpRequests',
    timestamps: false,
  }
);

OtpRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
OtpRequestSchema.index({ schoolId: 1, phone: 1, createdAt: -1 });

export const OtpRequest: Model<IOtpRequest> =
  mongoose.models.OtpRequest ||
  mongoose.model<IOtpRequest>('OtpRequest', OtpRequestSchema);
