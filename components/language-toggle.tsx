'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { setLocaleAction } from '@/app/actions/locale';
import { Button } from '@/components/ui/button';

export function LanguageToggle({
  onBrandBlue = false,
  segmented = false,
}: {
  onBrandBlue?: boolean;
  segmented?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('app');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const nextLocale = locale === 'hi' ? 'en' : 'hi';

  const handleSetLocale = (target: 'hi' | 'en') => {
    if (target === locale) return;
    startTransition(async () => {
      await setLocaleAction(target);
      router.refresh();
    });
  };

  const handleToggle = () => {
    startTransition(async () => {
      await setLocaleAction(nextLocale);
      router.refresh();
    });
  };

  if (segmented) {
    return (
      <div
        role="group"
        aria-label="Toggle language"
        className="inline-flex items-center rounded-full border border-white/30 bg-white/10 p-0.5 text-xs font-semibold text-white"
      >
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleSetLocale('hi')}
          className={`rounded-full px-3 py-1 transition-colors ${
            locale === 'hi'
              ? 'bg-white text-brand-blue shadow-xs'
              : 'text-white/90 hover:text-white'
          }`}
        >
          हिंदी
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleSetLocale('en')}
          className={`rounded-full px-3 py-1 transition-colors ${
            locale === 'en'
              ? 'bg-white text-brand-blue shadow-xs'
              : 'text-white/90 hover:text-white'
          }`}
        >
          English
        </button>
      </div>
    );
  }

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
          ? 'h-8 rounded-md border border-white/35 bg-white/10 px-2.5 text-xs font-semibold text-white hover:bg-white/20 hover:text-white'
          : 'h-8 px-2.5 text-xs font-semibold'
      }
    >
      {t('languageToggle')}
    </Button>
  );
}
