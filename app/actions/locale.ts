'use server';

import { cookies } from 'next/headers';
import { localeSchema } from '@/lib/validations';

export async function setLocaleAction(inputLocale: string) {
  const locale = localeSchema.parse(inputLocale);
  const cookieStore = await cookies();
  cookieStore.set('NEXT_LOCALE', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}
