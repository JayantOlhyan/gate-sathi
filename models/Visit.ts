import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export type VisitPurpose =
  | 'student_pickup'
  | 'parent_meeting'
  | 'official_inspection'
  | 'vendor_delivery'
  | 'maintenance'
  | 'other';

export type VisitStatus = 'checked_in' | 'checked_out' | 'denied';

export interface IVisit extends Document {
  schoolId: Types.ObjectId;
  visitorId: Types.ObjectId;
  studentId?: Types.ObjectId;
  purpose: VisitPurpose;
  status: VisitStatus;
  checkInAt: Date;
  checkOutAt: Date | null;
  checkedInBy: Types.ObjectId;
  checkedOutBy?: Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const VisitSchema = new Schema<IVisit>(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    visitorId: {
      type: Schema.Types.ObjectId,
      ref: 'Visitor',
      required: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
    },
    purpose: {
      type: String,
      enum: [
        'student_pickup',
        'parent_meeting',
        'official_inspection',
        'vendor_delivery',
        'maintenance',
        'other',
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ['checked_in', 'checked_out', 'denied'],
      default: 'checked_in',
    },
    checkInAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    checkOutAt: {
      type: Date,
      default: null,
    },
    checkedInBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    checkedOutBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

VisitSchema.index({ schoolId: 1, checkInAt: -1 });
VisitSchema.index({ schoolId: 1, status: 1, checkInAt: -1 });
VisitSchema.index({ schoolId: 1, visitorId: 1, checkInAt: -1 });
VisitSchema.index({ schoolId: 1, studentId: 1, checkInAt: -1 });

export const Visit: Model<IVisit> =
  mongoose.models.Visit || mongoose.model<IVisit>('Visit', VisitSchema);
