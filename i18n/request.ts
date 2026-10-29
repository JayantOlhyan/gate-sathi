import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { localeSchema } from '@/lib/validations';

export const DEFAULT_LOCALE = 'hi';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get('NEXT_LOCALE')?.value;
  const parsed = localeSchema.safeParse(rawLocale);
  const locale = parsed.success ? parsed.data : DEFAULT_LOCALE;

  const messages = (await import(`../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
  };
});
