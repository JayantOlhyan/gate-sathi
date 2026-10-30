import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface ILead extends Document {
  name: string;
  schoolName: string;
  role: string;
  phone: string;
  message: string;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    name: { type: String, required: true, trim: true },
    schoolName: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    phone: {
      type: String,
      required: true,
      trim: true,
      match: /^[6-9]\d{9}$/,
    },
    message: { type: String, default: '', trim: true },
    ip: { type: String, trim: true },
  },
  { timestamps: true, collection: 'leads' }
);

LeadSchema.index({ createdAt: -1 });

export const Lead: Model<ILead> =
  mongoose.models.Lead || mongoose.model<ILead>('Lead', LeadSchema);
