import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface ISchool extends Document {
  schoolId: string;
  name: string;
  udiseCode: string;
  district: string;
  state: string;
  address?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SchoolSchema = new Schema<ISchool>(
  {
    schoolId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    udiseCode: {
      type: String,
      required: true,
      trim: true,
    },
    district: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
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

SchoolSchema.index({ schoolId: 1 }, { unique: true });
SchoolSchema.index({ udiseCode: 1 }, { unique: true });
SchoolSchema.index({ state: 1, district: 1 });

export const School: Model<ISchool> =
  mongoose.models.School || mongoose.model<ISchool>('School', SchoolSchema);
