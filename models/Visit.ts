import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export type VisitPurpose =
  | 'student_pickup'
  | 'parent_meeting'
  | 'official_inspection'
  | 'vendor_delivery'
  | 'maintenance'
  | 'other';

export interface IVisit extends Document {
  schoolId: Types.ObjectId;
  clientId: string;
  visitorId: Types.ObjectId;
  studentIds: Types.ObjectId[];
  purpose: VisitPurpose;
  entryAt: Date;
  exitAt: Date | null;
  checkedInBy: Types.ObjectId;
  checkedOutBy?: Types.ObjectId;
  notes?: string;
  readonly isInside: boolean;
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
    clientId: {
      type: String,
      required: true,
      trim: true,
    },
    visitorId: {
      type: Schema.Types.ObjectId,
      ref: 'Visitor',
      required: true,
    },
    studentIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Student', required: true }],
      required: true,
      validate: {
        validator: (arr: unknown[]) => Array.isArray(arr) && arr.length >= 1,
        message: 'studentIds must contain at least 1 studentId',
      },
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
    entryAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    exitAt: {
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
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

VisitSchema.virtual('isInside').get(function (this: IVisit) {
  return this.exitAt === null;
});

VisitSchema.index({ schoolId: 1, clientId: 1 }, { unique: true });
VisitSchema.index({ schoolId: 1, entryAt: -1 });
VisitSchema.index({ schoolId: 1, exitAt: 1 });
VisitSchema.index({ schoolId: 1, studentIds: 1 });
VisitSchema.index({ schoolId: 1, visitorId: 1, entryAt: -1 });

export function isVisitInside(visit: Pick<IVisit, 'exitAt'>): boolean {
  return visit.exitAt === null;
}

export async function recordVisit(input: {
  schoolId: Types.ObjectId | string;
  clientId: string;
  visitorId: Types.ObjectId | string;
  studentIds: Array<Types.ObjectId | string>;
  purpose: VisitPurpose;
  checkedInBy: Types.ObjectId | string;
  entryAt?: Date;
  exitAt?: Date | null;
  notes?: string;
}): Promise<IVisit> {
  return await Visit.create({
    ...input,
    exitAt: input.exitAt ?? null,
  });
}

export const Visit: Model<IVisit> =
  mongoose.models.Visit || mongoose.model<IVisit>('Visit', VisitSchema);
