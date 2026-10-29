import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export interface IStudent extends Document {
  schoolId: Types.ObjectId;
  name: string;
  className: string;
  section: string;
  rollNumber: string;
  guardianPhone?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    className: {
      type: String,
      required: true,
      trim: true,
    },
    section: {
      type: String,
      required: true,
      default: 'A',
      trim: true,
    },
    rollNumber: {
      type: String,
      required: true,
      trim: true,
    },
    guardianPhone: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

StudentSchema.index({ schoolId: 1, className: 1, section: 1, rollNumber: 1 }, { unique: true });
StudentSchema.index({ schoolId: 1, name: 1 });

export const Student: Model<IStudent> =
  mongoose.models.Student || mongoose.model<IStudent>('Student', StudentSchema);
