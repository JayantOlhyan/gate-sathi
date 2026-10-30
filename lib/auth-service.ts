import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import {
  consumeLoginAttempt,
  getRateLimiter,
  RateLimitError,
} from '@/lib/rate-limit';
import { loginSchema, type Role } from '@/lib/validations';
import { User } from '@/models/User';

export { RateLimitError };

export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours
export const TOKEN_RECHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface AuthenticatedUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  schoolIds: string[];
  tokenVersion: number;
}

export async function authenticateWithPhoneAndPassword(
  rawCredentials: unknown,
  deps?: {
    ip?: string;
    skipDbConnect?: boolean;
    skipRateLimit?: boolean;
    nowMs?: number;
  }
): Promise<AuthenticatedUser | null> {
  const parsed = loginSchema.safeParse(rawCredentials);
  if (!parsed.success) {
    return null;
  }

  const { phone, password } = parsed.data;
  const ip = deps?.ip?.trim() || '127.0.0.1';

  if (!deps?.skipRateLimit) {
    await consumeLoginAttempt(phone, ip, deps?.nowMs);
  }

  // Preview fallback when MONGODB_URI is not yet configured in host environment
  if (!process.env.MONGODB_URI) {
    if (password === 'Password@123') {
      if (phone === '9999999992') {
        return {
          id: '6ae4b61d181c9c0a1f841a31',
          name: 'Ramesh Tiwari (Guard)',
          phone: '9999999992',
          role: 'guard',
          schoolIds: ['6ae4b61d181c9c0a1f841a3e'],
          tokenVersion: 0,
        };
      }
      if (phone === '9999999991') {
        return {
          id: '6ae4b61d181c9c0a1f841a32',
          name: 'Rajeshwari Mishra (Principal)',
          phone: '9999999991',
          role: 'principal',
          schoolIds: ['6ae4b61d181c9c0a1f841a3e'],
          tokenVersion: 0,
        };
      }
      if (phone === '9999999990') {
        return {
          id: '6ae4b61d181c9c0a1f841a33',
          name: 'State Super Admin',
          phone: '9999999990',
          role: 'super_admin',
          schoolIds: ['6ae4b61d181c9c0a1f841a3e'],
          tokenVersion: 0,
        };
      }
    }
    return null;
  }

  if (!deps?.skipDbConnect) {
    await connectDB();
  }

  const user = await User.findOne({ phone, isActive: true });
  if (!user) {
    return null;
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return null;
  }

  if (!deps?.skipRateLimit) {
    await getRateLimiter().reset(`login:phone_ip:${phone}:${ip}`);
    await getRateLimiter().reset(`login:phone:${phone}`);
  }

  return {
    id: String(user._id),
    name: user.name,
    phone: user.phone,
    role: user.role,
    schoolIds: user.schoolIds.map((id) => String(id)),
    tokenVersion: user.tokenVersion ?? 0,
  };
}

export interface JwtTokenState extends Record<string, unknown> {
  id?: string;
  phone?: string;
  role?: Role;
  schoolIds?: string[];
  tokenVersion?: number;
  lastCheckedAt?: number;
  invalidated?: boolean;
}

export async function verifyAndRefreshJwtToken(
  token: JwtTokenState,
  user?: AuthenticatedUser,
  deps?: { nowMs?: number; skipDbConnect?: boolean }
): Promise<JwtTokenState> {
  const nowMs = deps?.nowMs ?? Date.now();

  if (user) {
    return {
      ...token,
      id: user.id,
      phone: user.phone,
      role: user.role,
      schoolIds: user.schoolIds,
      tokenVersion: user.tokenVersion ?? 0,
      lastCheckedAt: nowMs,
      invalidated: false,
    };
  }

  if (token.invalidated || !token.id) {
    return { ...token, invalidated: true };
  }

  const lastCheckedAt =
    typeof token.lastCheckedAt === 'number' ? token.lastCheckedAt : 0;

  // Re-check user.isActive and tokenVersion against DB at most once every 5 minutes
  if (nowMs - lastCheckedAt < TOKEN_RECHECK_INTERVAL_MS) {
    return token;
  }

  if (!process.env.MONGODB_URI) {
    return token;
  }

  if (!deps?.skipDbConnect) {
    await connectDB();
  }

  const dbUser = await User.findById(token.id)
    .select('isActive tokenVersion role schoolIds')
    .lean();

  if (
    !dbUser ||
    !dbUser.isActive ||
    (dbUser.tokenVersion ?? 0) !== (token.tokenVersion ?? 0)
  ) {
    return {
      ...token,
      id: undefined,
      invalidated: true,
    };
  }

  return {
    ...token,
    role: dbUser.role,
    schoolIds: dbUser.schoolIds.map((id) => String(id)),
    tokenVersion: dbUser.tokenVersion ?? 0,
    lastCheckedAt: nowMs,
    invalidated: false,
  };
}

export function getDefaultRouteForRole(role: Role): string {
  return role === 'guard' ? '/gate' : '/dashboard';
}
