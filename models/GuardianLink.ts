import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export const GUARDIAN_RELATIONS = [
  'Father',
  'Mother',
  'Grandparent',
  'Sibling',
  'Uncle',
  'Aunt',
  'Other',
] as const;

export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

export interface IGuardianLink extends Document {
  schoolId: Types.ObjectId;
  studentId: Types.ObjectId;
  visitorId: Types.ObjectId;
  relation: GuardianRelation;
  approved: boolean;
  approvedBy: Types.ObjectId;
  approvedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GuardianLinkSchema = new Schema<IGuardianLink>(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
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
    relation: {
      type: String,
      enum: GUARDIAN_RELATIONS,
      required: true,
    },
    approved: {
      type: Boolean,
      default: true,
      required: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true }
);

GuardianLinkSchema.index({ schoolId: 1, studentId: 1, visitorId: 1 }, { unique: true });
GuardianLinkSchema.index({ schoolId: 1, visitorId: 1 });
GuardianLinkSchema.index({ schoolId: 1, studentId: 1, approved: 1 });

export const GuardianLink: Model<IGuardianLink> =
  mongoose.models.GuardianLink ||
  mongoose.model<IGuardianLink>('GuardianLink', GuardianLinkSchema);
