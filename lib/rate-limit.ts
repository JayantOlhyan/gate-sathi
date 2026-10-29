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

    if (existing.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(existing.resetAtMs),
      };
    }

    existing.count += 1;
    return {
      allowed: true,
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

export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const LOGIN_MAX_PER_PHONE_IP = 5;
export const LOGIN_MAX_PER_IP = 20;

export class RateLimitError extends Error {
  status = 429;
  resetAt: Date;
  constructor(resetAt: Date) {
    super('Too many login attempts. Please try again in 15 minutes.');
    this.name = 'RateLimitError';
    this.resetAt = resetAt;
  }
}

let activeRateLimiter: RateLimiter = new InMemoryRateLimiter();

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
  const normalizedIp = ip.trim() || '127.0.0.1';
  const normalizedPhone = phone.trim();

  const ipResult = await activeRateLimiter.consume(
    `login:ip:${normalizedIp}`,
    LOGIN_MAX_PER_IP,
    LOGIN_WINDOW_MS,
    nowMs
  );
  if (!ipResult.allowed) {
    throw new RateLimitError(ipResult.resetAt);
  }

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
