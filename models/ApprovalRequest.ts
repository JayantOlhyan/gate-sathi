import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export const APPROVAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'escalated',
  'expired',
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface IApprovalRequest extends Document {
  schoolId: Types.ObjectId;
  visitId: Types.ObjectId;
  studentId: Types.ObjectId;
  visitorId: Types.ObjectId;
  teacherId: Types.ObjectId | null;
  status: ApprovalStatus;
  requestedBy: Types.ObjectId;
  decidedBy: Types.ObjectId | null;
  decidedAt: Date | null;
  escalatedAt: Date | null;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalRequestSchema = new Schema<IApprovalRequest>(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    visitId: {
      type: Schema.Types.ObjectId,
      ref: 'Visit',
      required: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    visitorId: {
      type: Schema.Types.ObjectId,
      ref: 'Visitor',
      required: true,
    },
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: APPROVAL_STATUSES,
      default: 'pending',
      required: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    decidedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
    escalatedAt: {
      type: Date,
      default: null,
    },
    note: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

ApprovalRequestSchema.index({ schoolId: 1, status: 1, createdAt: 1 });
ApprovalRequestSchema.index({ teacherId: 1, status: 1 });
ApprovalRequestSchema.index({ visitId: 1 });
ApprovalRequestSchema.index({ studentId: 1 });

export const ApprovalRequest: Model<IApprovalRequest> =
  mongoose.models.ApprovalRequest ||
  mongoose.model<IApprovalRequest>('ApprovalRequest', ApprovalRequestSchema);
