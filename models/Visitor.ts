import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export interface IVisitor extends Document {
  schoolId: Types.ObjectId;
  name: string;
  phone: string;
  photoKey?: string;
  idProofType?: 'aadhaar_last4' | 'voter_id' | 'driving_license' | 'other';
  idProofValue?: string;
  isBlocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VisitorSchema = new Schema<IVisitor>(
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
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    photoKey: {
      type: String,
      trim: true,
    },
    idProofType: {
      type: String,
      enum: ['aadhaar_last4', 'voter_id', 'driving_license', 'other'],
    },
    idProofValue: {
      type: String,
      trim: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

VisitorSchema.index({ schoolId: 1, phone: 1 }, { unique: true });
VisitorSchema.index({ schoolId: 1, name: 1 });

export const Visitor: Model<IVisitor> =
  mongoose.models.Visitor || mongoose.model<IVisitor>('Visitor', VisitorSchema);
