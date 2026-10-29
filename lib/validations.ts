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
