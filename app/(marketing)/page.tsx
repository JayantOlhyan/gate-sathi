import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Phone, Camera, Eye, ShieldCheck } from 'lucide-react';
import { auth } from '@/auth';
import { LanguageToggle } from '@/components/language-toggle';
import { ContactForm } from './contact-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing');
  return {
    manifest: '/manifest.webmanifest',
    title: t('metaTitle'),
    description: t('metaDescription'),
    openGraph: {
      title: t('metaTitle'),
      description: t('metaDescription'),
      images: [
        {
          url: '/brand/logo-horizontal.png',
          width: 1200,
          height: 400,
          alt: 'GateSathi',
        },
      ],
    },
  };
}

export default async function MarketingLandingPage() {
  let isLoggedIn = false;
  try {
    const session = await auth();
    isLoggedIn = Boolean(session?.user?.id && session.user.role);
  } catch {
    isLoggedIn = false;
  }

  const t = await getTranslations('marketing');

  return (
    <div className="min-h-dvh bg-white text-slate-900">
      {/* 1. Header */}
      <header className="border-b border-slate-200 bg-brand-blue text-white">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/brand/icon-white.png"
              alt="GateSathi"
              width={32}
              height={32}
              priority
              className="h-8 w-8 shrink-0"
            />
            <span className="text-base font-bold tracking-tight text-white">
              GateSathi
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageToggle onBrandBlue />
            <Link
              href={isLoggedIn ? '/app' : '/login'}
              className="inline-flex h-8 items-center justify-center rounded-md bg-white px-3 text-xs font-semibold text-brand-blue shadow-sm hover:bg-slate-100"
            >
              {isLoggedIn ? t('openAppBtn') : t('loginBtn')}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* 2. Hero */}
        <section className="border-b border-slate-200 bg-slate-50 py-10 sm:py-14">
          <div className="mx-auto max-w-4xl px-4">
            <Image
              src="/brand/logo-horizontal.png"
              alt="GateSathi"
              width={220}
              height={73}
              priority
              className="h-auto w-[200px] sm:w-[220px]"
            />
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-brand-blue sm:text-4xl">
              {t('heroTitle')}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-700 sm:text-base">
              {t('heroSubtitle')}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={isLoggedIn ? '/app' : '/login'}
                className="inline-flex h-11 items-center justify-center rounded-md bg-brand-blue px-5 text-sm font-semibold text-white shadow-sm hover:bg-brand-blue/90"
              >
                {isLoggedIn ? t('heroPrimaryOpenApp') : t('heroPrimaryLogin')}
              </Link>
              <a
                href="#contact"
                className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
              >
                {t('heroSecondaryPilot')}
              </a>
            </div>
          </div>
        </section>

        {/* 3. Problem */}
        <section className="border-b border-slate-200 py-8 sm:py-10">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
              {t('problemHeading')}
            </h2>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <li className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                {t('problem1')}
              </li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                {t('problem2')}
              </li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                {t('problem3')}
              </li>
            </ul>
          </div>
        </section>

        {/* 4. How it works */}
        <section className="border-b border-slate-200 bg-slate-50 py-8 sm:py-10">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
              {t('howHeading')}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <Phone className="h-5 w-5 text-brand-blue" aria-hidden="true" />
                <h3 className="mt-2 text-sm font-bold text-slate-900">
                  {t('how1Title')}
                </h3>
                <p className="mt-1 text-xs text-slate-600">{t('how1Desc')}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <Camera
                  className="h-5 w-5 text-brand-blue"
                  aria-hidden="true"
                />
                <h3 className="mt-2 text-sm font-bold text-slate-900">
                  {t('how2Title')}
                </h3>
                <p className="mt-1 text-xs text-slate-600">{t('how2Desc')}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <Eye className="h-5 w-5 text-brand-blue" aria-hidden="true" />
                <h3 className="mt-2 text-sm font-bold text-slate-900">
                  {t('how3Title')}
                </h3>
                <p className="mt-1 text-xs text-slate-600">{t('how3Desc')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Features grid (6 cards, one line each) */}
        <section className="border-b border-slate-200 py-8 sm:py-10">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
              {t('featuresHeading')}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-800">
                {t('f1')}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-800">
                {t('f2')}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-800">
                {t('f3')}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-800">
                {t('f4')}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-800">
                {t('f5')}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-800">
                {t('f6')}
              </div>
            </div>
          </div>
        </section>

        {/* 6. Privacy and safety */}
        <section className="border-b border-slate-200 bg-slate-50 py-8 sm:py-10">
          <div className="mx-auto max-w-4xl px-4">
            <div className="flex items-center gap-2">
              <ShieldCheck
                className="h-5 w-5 text-brand-blue"
                aria-hidden="true"
              />
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
                {t('privacyHeading')}
              </h2>
            </div>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-slate-800">
              <li>{t('p1')}</li>
              <li>{t('p2')}</li>
              <li>{t('p3')}</li>
              <li>{t('p4')}</li>
              <li>{t('p5')}</li>
            </ul>
          </div>
        </section>

        {/* 7. For government schools */}
        <section className="border-b border-slate-200 bg-brand-blue py-8 text-white sm:py-10">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/80">
              {t('govHeading')}
            </h2>
            <p className="mt-1 text-xl font-extrabold text-white sm:text-2xl">
              {t('govStatement')}
            </p>
          </div>
        </section>

        {/* 8. Contact / request a pilot */}
        <section id="contact" className="py-8 sm:py-12">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
              {t('contactHeading')}
            </h2>
            <p className="mt-1 mb-5 text-xs text-slate-600 sm:text-sm">
              {t('contactSub')}
            </p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-6">
              <ContactForm
                labels={{
                  fieldName: t('fieldName'),
                  fieldSchool: t('fieldSchool'),
                  fieldRole: t('fieldRole'),
                  fieldPhone: t('fieldPhone'),
                  fieldMessage: t('fieldMessage'),
                  submitPilotBtn: t('submitPilotBtn'),
                  submittingPilot: t('submittingPilot'),
                  thankYouMessage: t('thankYouMessage'),
                  errorMessage: t('errorMessage'),
                  rateLimitMessage: t('rateLimitMessage'),
                }}
              />
            </div>
          </div>
        </section>
      </main>

      {/* 9. Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 py-6 text-xs text-slate-600">
        <div className="mx-auto flex max-w-4xl flex-col items-start justify-between gap-2 px-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="font-bold text-brand-blue">GateSathi</span>
            <span>·</span>
            <span>{t('footerBuiltBy')}</span>
          </div>
          <Link
            href="/privacy"
            className="font-medium text-brand-blue underline-offset-2 hover:underline"
          >
            {t('footerPrivacy')}
          </Link>
        </div>
      </footer>
    </div>
  );
}
