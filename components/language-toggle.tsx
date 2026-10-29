'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { setLocaleAction } from '@/app/actions/locale';
import { Button } from '@/components/ui/button';

export function LanguageToggle() {
  const locale = useLocale();
  const t = useTranslations('app');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const nextLocale = locale === 'hi' ? 'en' : 'hi';

  const handleToggle = () => {
    startTransition(async () => {
      await setLocaleAction(nextLocale);
      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={handleToggle}
      aria-label="Toggle language"
    >
      {t('languageToggle')}
    </Button>
  );
}
