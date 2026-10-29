import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import { loginSchema, type Role } from '@/lib/validations';
import { User } from '@/models/User';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export class AuthLockoutError extends Error {
  status = 423;
  lockUntil: Date;
  constructor(lockUntil: Date) {
    super('Account is temporarily locked due to too many failed login attempts');
    this.name = 'AuthLockoutError';
    this.lockUntil = lockUntil;
  }
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  schoolIds: string[];
}

export async function authenticateWithPhoneAndPassword(
  rawCredentials: unknown,
  deps?: { skipDbConnect?: boolean }
): Promise<AuthenticatedUser | null> {
  const parsed = loginSchema.safeParse(rawCredentials);
  if (!parsed.success) {
    return null;
  }

  if (!deps?.skipDbConnect) {
    await connectDB();
  }

  const { phone, password } = parsed.data;
  const user = await User.findOne({ phone, isActive: true });
  if (!user) {
    return null;
  }

  const now = new Date();
  if (user.lockUntil && user.lockUntil > now) {
    throw new AuthLockoutError(user.lockUntil);
  }

  // Reset expired lock window before evaluating new attempt
  if (user.lockUntil && user.lockUntil <= now) {
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockUntil = new Date(now.getTime() + LOCK_DURATION_MS);
    }
    await user.save();

    if (user.lockUntil) {
      throw new AuthLockoutError(user.lockUntil);
    }
    return null;
  }

  if (user.failedLoginAttempts > 0 || user.lockUntil !== null) {
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
  }

  return {
    id: String(user._id),
    name: user.name,
    phone: user.phone,
    role: user.role,
    schoolIds: user.schoolIds.map((id) => String(id)),
  };
}

export function getDefaultRouteForRole(role: Role): string {
  return role === 'guard' ? '/gate' : '/dashboard';
}
