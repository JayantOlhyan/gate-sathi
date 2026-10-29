import { z } from 'zod';

export const ROLES = ['super_admin', 'principal', 'guard'] as const;
export type Role = (typeof ROLES)[number];

export const indianPhoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Invalid 10-digit Indian phone number');

export const loginSchema = z.object({
  phone: indianPhoneSchema,
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
});

export const localeSchema = z.enum(['hi', 'en']);

export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

export const studentInputSchema = z.object({
  schoolId: z.string().trim().min(1),
  admissionNo: z.string().trim().min(1, 'admissionNo is required'),
  name: z.string().trim().min(1),
  className: z.string().trim().min(1),
  section: z.string().trim().min(1).default('A'),
  rollNumber: z.string().trim().min(1),
  guardianPhone: indianPhoneSchema.optional(),
  isActive: z.boolean().default(true),
});

export const visitPurposes = [
  'student_pickup',
  'parent_meeting',
  'official_inspection',
  'vendor_delivery',
  'maintenance',
  'other',
] as const;

export const visitInputSchema = z.object({
  schoolId: z.string().trim().min(1),
  clientId: z.string().trim().min(1, 'clientId is required'),
  visitorId: z.string().trim().min(1),
  studentIds: z.array(z.string().trim().min(1)).min(1, 'At least one studentId is required'),
  purpose: z.enum(visitPurposes),
  entryAt: z.coerce.date().optional(),
  exitAt: z.coerce.date().nullable().optional().default(null),
  checkedInBy: z.string().trim().min(1),
  checkedOutBy: z.string().trim().min(1).optional(),
  notes: z.string().trim().optional(),
});
