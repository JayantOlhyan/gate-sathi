import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import type { Role } from '@/lib/validations';

export interface IUser extends Document {
  name: string;
  phone: string;
  passwordHash: string;
  role: Role;
  schoolIds: Types.ObjectId[];
  tokenVersion: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
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
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['super_admin', 'principal', 'guard'],
      required: true,
    },
    schoolIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'School' }],
      default: [],
    },
    tokenVersion: {
      type: Number,
      default: 0,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

UserSchema.index({ phone: 1 }, { unique: true });
UserSchema.index({ schoolIds: 1, role: 1 });

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
