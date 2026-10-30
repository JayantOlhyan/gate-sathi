'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { setLocaleAction } from '@/app/actions/locale';
import { Button } from '@/components/ui/button';

export function LanguageToggle({
  onBrandBlue = false,
}: {
  onBrandBlue?: boolean;
}) {
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
      variant={onBrandBlue ? 'ghost' : 'outline'}
      size="sm"
      disabled={isPending}
      onClick={handleToggle}
      aria-label="Toggle language"
      className={
        onBrandBlue
          ? 'h-8 border border-white/40 bg-transparent px-2.5 text-xs font-medium text-white hover:bg-white/15 hover:text-white'
          : 'h-8 px-2.5 text-xs'
      }
    >
      {t('languageToggle')}
    </Button>
  );
}
