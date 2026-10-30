import { z } from 'zod';
import { GUARDIAN_RELATIONS } from '@/models/GuardianLink';
import { UNAPPROVED_REASON_CODES } from '@/models/Visit';

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
  name: z.string().trim().min(1, 'name is required'),
  className: z.string().trim().min(1, 'className is required'),
  section: z.string().trim().min(1, 'section is required').default('A'),
  rollNumber: z.string().trim().optional().default(''),
  guardianPhone: indianPhoneSchema.optional(),
  isActive: z.boolean().default(true),
});

export const studentCreateBodySchema = z.object({
  admissionNo: z.string().trim().min(1, 'Admission number is required'),
  name: z.string().trim().min(1, 'Student name is required'),
  className: z.string().trim().min(1, 'Class is required'),
  section: z.string().trim().min(1, 'Section is required'),
  rollNumber: z.string().trim().optional().default(''),
});

export const studentUpdateBodySchema = z
  .object({
    admissionNo: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    className: z.string().trim().min(1).optional(),
    section: z.string().trim().min(1).optional(),
    rollNumber: z.string().trim().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const studentListQuerySchema = z.object({
  q: z.string().trim().optional(),
  className: z.string().trim().optional(),
  section: z.string().trim().optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const columnMappingSchema = z.object({
  admissionNo: z.string().trim().min(1),
  name: z.string().trim().min(1),
  className: z.string().trim().min(1),
  section: z.string().trim().min(1),
  rollNumber: z.string().trim().optional(),
  fatherName: z.string().trim().optional(),
  fatherPhone: z.string().trim().optional(),
  motherName: z.string().trim().optional(),
  motherPhone: z.string().trim().optional(),
  guardianName: z.string().trim().optional(),
  guardianPhone: z.string().trim().optional(),
  guardianRelation: z.string().trim().optional(),
});

export type ColumnMapping = z.infer<typeof columnMappingSchema>;

export const studentImportRowSchema = z.object({
  admissionNo: z.string().trim().min(1, 'Missing admissionNo'),
  name: z.string().trim().min(1, 'Missing student name'),
  className: z.string().trim().min(1, 'Missing className'),
  section: z.string().trim().min(1, 'Missing section'),
  rollNumber: z.string().trim().optional().default(''),
});

export const guardianAddBodySchema = z.object({
  phone: indianPhoneSchema,
  name: z.string().trim().min(1, 'Guardian name is required'),
  relation: z.enum(GUARDIAN_RELATIONS),
  conflictResolution: z.enum(['use_existing', 'update_name']).optional(),
});

export const visitPurposes = [
  'Meet student',
  'Pickup',
  'PTM',
  'Office work',
  'Other',
  'student_pickup',
  'parent_meeting',
  'official_inspection',
  'vendor_delivery',
  'maintenance',
  'other',
] as const;

export const gatePurposes = [
  'Meet student',
  'Pickup',
  'PTM',
  'Office work',
  'Other',
] as const;

export type GatePurpose = (typeof gatePurposes)[number];

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

export const uploadSignBodySchema = z.object({
  schoolId: z.string().trim().min(1),
  contentType: z.enum(['image/jpeg', 'image/webp']),
  contentLength: z
    .number()
    .int()
    .min(1, 'File cannot be empty')
    .max(1024 * 1024, 'File size exceeds 1 MB limit'),
});

export const otpSendBodySchema = z.object({
  schoolId: z.string().trim().min(1),
  phone: indianPhoneSchema,
});

export const otpVerifyBodySchema = z.object({
  schoolId: z.string().trim().min(1),
  phone: indianPhoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

export const gateLookupQuerySchema = z.object({
  schoolId: z.string().trim().min(1),
  phone: indianPhoneSchema,
});

export const gateCreateVisitBodySchema = z.object({
  schoolId: z.string().trim().min(1),
  clientId: z.string().trim().min(1, 'clientId is required'),
  phone: indianPhoneSchema,
  name: z.string().trim().min(1, 'Visitor name is required'),
  relation: z.enum(GUARDIAN_RELATIONS).optional(),
  photoKey: z.string().trim().optional(),
  consentAt: z.coerce.date().optional(),
  consentVersion: z.string().trim().min(1).optional(),
  studentIds: z
    .array(objectIdSchema)
    .min(1, 'At least one student must be selected'),
  purpose: z.enum(gatePurposes),
  purposeNote: z.string().trim().optional(),
  reasonCode: z.enum(UNAPPROVED_REASON_CODES).optional(),
  reasonText: z.string().trim().optional(),
});

export const gateExitVisitBodySchema = z.object({
  schoolId: z.string().trim().min(1),
  leftWithStudent: z.boolean().optional().default(false),
});

export const leadCreateBodySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  schoolName: z.string().trim().min(1, 'School name is required').max(200),
  role: z.string().trim().min(1, 'Role is required').max(80),
  phone: indianPhoneSchema,
  message: z.string().trim().max(1000).optional().default(''),
  website: z.string().optional().default(''),
  honeypot: z.string().optional().default(''),
});

