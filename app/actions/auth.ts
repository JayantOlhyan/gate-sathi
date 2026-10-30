'use server';

import { signIn, signOut } from '@/auth';
import { RateLimitError } from '@/lib/auth-service';
import { loginSchema } from '@/lib/validations';

export interface LoginActionResult {
  ok: boolean;
  errorCode?: 'validationError' | 'invalidCredentials' | 'lockedAccount';
  redirectTo?: string;
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof RateLimitError) return true;
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  if (e.name === 'RateLimitError') return true;
  const cause = e.cause as Record<string, unknown> | undefined;
  if (cause?.name === 'RateLimitError' || cause instanceof RateLimitError) {
    return true;
  }
  const causeErr = cause?.err as Record<string, unknown> | undefined;
  if (causeErr?.name === 'RateLimitError' || causeErr instanceof RateLimitError) {
    return true;
  }
  return false;
}

export async function loginAction(rawInput: {
  phone: string;
  password: string;
}): Promise<LoginActionResult> {
  const parsed = loginSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, errorCode: 'validationError' };
  }

  try {
    // authorize() inside signIn is the sole place that rate-limits and checks the password
    await signIn('credentials', {
      phone: parsed.data.phone,
      password: parsed.data.password,
      redirect: false,
    });

    return {
      ok: true,
      redirectTo: '/app',
    };
  } catch (error: unknown) {
    if (isRateLimitError(error)) {
      return { ok: false, errorCode: 'lockedAccount' };
    }
    return { ok: false, errorCode: 'invalidCredentials' };
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: '/login' });
}
