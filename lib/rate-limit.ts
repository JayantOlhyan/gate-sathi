import { connectDB } from '@/lib/db';
import { RateLimit } from '@/models/RateLimit';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export interface RateLimiter {
  consume(
    key: string,
    limit: number,
    windowMs: number,
    nowMs?: number
  ): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
  clearAll(): Promise<void>;
}

interface BucketEntry {
  count: number;
  resetAtMs: number;
}

export class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, BucketEntry>();

  async consume(
    key: string,
    limit: number,
    windowMs: number,
    nowMs: number = Date.now()
  ): Promise<RateLimitResult> {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAtMs <= nowMs) {
      const resetAtMs = nowMs + windowMs;
      this.buckets.set(key, { count: 1, resetAtMs });
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        resetAt: new Date(resetAtMs),
      };
    }

    existing.count += 1;
    const allowed = existing.count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - existing.count),
      resetAt: new Date(existing.resetAtMs),
    };
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  async clearAll(): Promise<void> {
    this.buckets.clear();
  }
}

export class MongoRateLimiter implements RateLimiter {
  async consume(
    key: string,
    limit: number,
    windowMs: number,
    nowMs: number = Date.now()
  ): Promise<RateLimitResult> {
    await connectDB();

    const now = new Date(nowMs);
    const windowCutoff = new Date(nowMs - windowMs);
    const newExpiresAt = new Date(nowMs + windowMs);

    // Atomic findOneAndUpdate with an aggregation pipeline update:
    // Resets count=1, windowStart=now, expiresAt=newExpiresAt if window expired,
    // otherwise increments count by 1 atomically.
    const doc = await RateLimit.findOneAndUpdate(
      { key },
      [
        {
          $set: {
            key: { $ifNull: ['$key', key] },
            count: {
              $cond: {
                if: {
                  $or: [
                    { $not: ['$windowStart'] },
                    { $lte: ['$windowStart', windowCutoff] },
                  ],
                },
                then: 1,
                else: { $add: [{ $ifNull: ['$count', 0] }, 1] },
              },
            },
            windowStart: {
              $cond: {
                if: {
                  $or: [
                    { $not: ['$windowStart'] },
                    { $lte: ['$windowStart', windowCutoff] },
                  ],
                },
                then: now,
                else: '$windowStart',
              },
            },
            expiresAt: {
              $cond: {
                if: {
                  $or: [
                    { $not: ['$windowStart'] },
                    { $lte: ['$windowStart', windowCutoff] },
                  ],
                },
                then: newExpiresAt,
                else: { $ifNull: ['$expiresAt', newExpiresAt] },
              },
            },
          },
        },
      ],
      { upsert: true, new: true }
    );

    const count = doc?.count ?? 1;
    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    const resetAt = doc?.expiresAt ?? newExpiresAt;

    return {
      allowed,
      remaining,
      resetAt,
    };
  }

  async reset(key: string): Promise<void> {
    await connectDB();
    await RateLimit.deleteOne({ key });
  }

  async clearAll(): Promise<void> {
    await connectDB();
    await RateLimit.deleteMany({});
  }
}

export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const LOGIN_MAX_PER_PHONE_IP = 5;
export const LOGIN_MAX_PER_IP = 100; // 100 / 15 min (carriers share IPs)
export const LOGIN_MAX_PER_PHONE = 30; // 30 / 15 min per phone across all IPs

export class RateLimitError extends Error {
  status = 429;
  resetAt: Date;
  constructor(resetAt: Date) {
    super('Too many login attempts. Please try again in 15 minutes.');
    this.name = 'RateLimitError';
    this.resetAt = resetAt;
  }
}

// Switch login limits to MongoRateLimiter; in-memory stays only for tests
let activeRateLimiter: RateLimiter =
  process.env.NODE_ENV === 'test'
    ? new InMemoryRateLimiter()
    : new MongoRateLimiter();

export function getRateLimiter(): RateLimiter {
  return activeRateLimiter;
}

export function setRateLimiter(limiter: RateLimiter): void {
  activeRateLimiter = limiter;
}

export async function consumeLoginAttempt(
  phone: string,
  ip: string,
  nowMs: number = Date.now()
): Promise<void> {
  const normalizedIp = ip.trim() || 'unknown';
  const normalizedPhone = phone.trim();

  // 1. 100 per IP / 15 min (carriers share IPs)
  const ipResult = await activeRateLimiter.consume(
    `login:ip:${normalizedIp}`,
    LOGIN_MAX_PER_IP,
    LOGIN_WINDOW_MS,
    nowMs
  );
  if (!ipResult.allowed) {
    throw new RateLimitError(ipResult.resetAt);
  }

  // 2. 30 per phone across all IPs / 15 min
  const phoneResult = await activeRateLimiter.consume(
    `login:phone:${normalizedPhone}`,
    LOGIN_MAX_PER_PHONE,
    LOGIN_WINDOW_MS,
    nowMs
  );
  if (!phoneResult.allowed) {
    throw new RateLimitError(phoneResult.resetAt);
  }

  // 3. 5 per phone+IP / 15 min
  const phoneIpResult = await activeRateLimiter.consume(
    `login:phone_ip:${normalizedPhone}:${normalizedIp}`,
    LOGIN_MAX_PER_PHONE_IP,
    LOGIN_WINDOW_MS,
    nowMs
  );
  if (!phoneIpResult.allowed) {
    throw new RateLimitError(phoneIpResult.resetAt);
  }
}
