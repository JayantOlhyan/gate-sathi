import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export type GuardianRelationship = 'father' | 'mother' | 'guardian' | 'relative' | 'other';

export interface IGuardianLink extends Document {
  schoolId: Types.ObjectId;
  studentId: Types.ObjectId;
  visitorId: Types.ObjectId;
  relationship: GuardianRelationship;
  isApproved: boolean;
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
    relationship: {
      type: String,
      enum: ['father', 'mother', 'guardian', 'relative', 'other'],
      required: true,
    },
    isApproved: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

GuardianLinkSchema.index({ schoolId: 1, studentId: 1, visitorId: 1 }, { unique: true });
GuardianLinkSchema.index({ schoolId: 1, visitorId: 1 });

export const GuardianLink: Model<IGuardianLink> =
  mongoose.models.GuardianLink ||
  mongoose.model<IGuardianLink>('GuardianLink', GuardianLinkSchema);
