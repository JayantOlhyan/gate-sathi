'use server';

import { signIn, signOut } from '@/auth';
import {
  authenticateWithPhoneAndPassword,
  AuthLockoutError,
  getDefaultRouteForRole,
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

  try {
    const user = await authenticateWithPhoneAndPassword(parsed.data);
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
      redirectTo: getDefaultRouteForRole(user.role),
    };
  } catch (error) {
    if (error instanceof AuthLockoutError) {
      return { ok: false, errorCode: 'lockedAccount' };
    }
    return { ok: false, errorCode: 'invalidCredentials' };
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: '/login' });
}
