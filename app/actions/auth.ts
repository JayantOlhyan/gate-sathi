'use server';

import { headers } from 'next/headers';
import { signIn, signOut } from '@/auth';
import {
  authenticateWithPhoneAndPassword,
  RateLimitError,
} from '@/lib/auth-service';
import { loginSchema } from '@/lib/validations';

export interface LoginActionResult {
  ok: boolean;
  errorCode?: 'validationError' | 'invalidCredentials' | 'lockedAccount';
  redirectTo?: string;
}

export async function loginAction(rawInput: {
  phone: string;
  password: string;
}): Promise<LoginActionResult> {
  const parsed = loginSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, errorCode: 'validationError' };
  }

  const headerStore = await headers();
  const forwardedFor = headerStore.get('x-forwarded-for');
  const ip =
    forwardedFor?.split(',')[0]?.trim() ||
    headerStore.get('x-real-ip')?.trim() ||
    '127.0.0.1';

  try {
    const user = await authenticateWithPhoneAndPassword(parsed.data, { ip });
    if (!user) {
      return { ok: false, errorCode: 'invalidCredentials' };
    }

    await signIn('credentials', {
      phone: parsed.data.phone,
      password: parsed.data.password,
      redirect: false,
    });

    return {
      ok: true,
      redirectTo: '/app',
    };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { ok: false, errorCode: 'lockedAccount' };
    }
    return { ok: false, errorCode: 'invalidCredentials' };
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: '/login' });
}
