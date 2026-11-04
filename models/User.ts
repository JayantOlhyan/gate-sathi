import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import type { Role } from '@/lib/validations';

export interface IClassAssignment {
  schoolId: Types.ObjectId;
  className: string;
  section: string;
}

export interface IUser extends Document {
  name: string;
  phone: string;
  passwordHash: string;
  role: Role;
  schoolIds: Types.ObjectId[];
  classAssignments: IClassAssignment[];
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
      enum: ['super_admin', 'principal', 'guard', 'teacher'],
      required: true,
    },
    schoolIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'School' }],
      default: [],
    },
    classAssignments: {
      type: [
        {
          schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
          className: { type: String, required: true, trim: true },
          section: { type: String, required: true, trim: true },
        },
      ],
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
UserSchema.index({
  'classAssignments.schoolId': 1,
  'classAssignments.className': 1,
  'classAssignments.section': 1,
});

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
