import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LanguageToggle } from '@/components/language-toggle';

export default async function PrivacyPolicyPage() {
  const t = await getTranslations('privacy');

  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-brand-blue text-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="text-base font-bold text-white">
            GateSathi
          </Link>
          <LanguageToggle onBrandBlue />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <span className="inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-900">
            {t('draftBadge')}
          </span>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {t('title')}
          </h1>
          <p className="mt-2 text-sm text-slate-700">{t('intro')}</p>
        </div>

        <section className="space-y-1.5">
          <h2 className="text-base font-bold text-slate-900">{t('s1Title')}</h2>
          <p className="text-sm text-slate-700">{t('s1Body')}</p>
        </section>

        <section className="space-y-1.5">
          <h2 className="text-base font-bold text-slate-900">{t('s2Title')}</h2>
          <p className="text-sm text-slate-700">{t('s2Body')}</p>
        </section>

        <section className="space-y-1.5">
          <h2 className="text-base font-bold text-slate-900">{t('s3Title')}</h2>
          <p className="text-sm text-slate-700">{t('s3Body')}</p>
        </section>

        <div className="pt-4">
          <Link
            href="/"
            className="text-sm font-semibold text-brand-blue hover:underline"
          >
            ← {t('backHome')}
          </Link>
        </div>
      </main>
    </div>
  );
}
