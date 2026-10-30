import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { LanguageToggle } from '@/components/language-toggle';
import { DemoShowcase } from '@/components/demo-showcase';
import Image from 'next/image';

export const metadata = {
  title: 'GateSathi Mobile Guard Demo | मोबाइल सुरक्षा गार्ड दृश्य',
  description: 'Live interactive mobile phone demo of GateSathi gate pass verification and visitor entry.',
};

export default async function MobileDemoPage() {
  const locale = (await getLocale()) as 'hi' | 'en';
  const isHi = locale === 'hi';

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 pb-12">
      <header className="border-b border-slate-200 bg-brand-blue text-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/brand/logo-horizontal-white.png"
              alt="GateSathi"
              width={130}
              height={30}
              className="h-6 w-auto object-contain"
            />
          </Link>
          <div className="flex items-center gap-3">
            <LanguageToggle onBrandBlue />
            <Link
              href="/demo"
              className="rounded bg-white/20 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/30"
            >
              {isHi ? 'सभी डेमो' : 'All Demos'}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6">
        <div className="mb-4 text-center">
          <span className="inline-block rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-bold text-emerald-800">
            {isHi ? '📱 मोबाइल फ़ोन डेमो' : '📱 Mobile Phone Demo'}
          </span>
          <h1 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">
            {isHi ? 'गेट पर सुरक्षा गार्ड का मोबाइल इंटरफ़ेस' : 'Security Guard Mobile Gate Interface'}
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            {isHi
              ? 'आगंतुक मोबाइल नंबर जांचें, स्वीकृत अभिभावक सत्यापन देखें और एक टैप में गेट पास जारी करें।'
              : 'Verify visitor phone, check student guardian status, and issue gate passes with one tap.'}
          </p>
        </div>

        <DemoShowcase initialTab="mobile" locale={locale} standalone />

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold">
          <Link href="/demo/admin" className="text-brand-blue hover:underline">
            💻 {isHi ? 'प्रधानाचार्य एडमिन डेमो देखें →' : 'Switch to Admin Principal Demo →'}
          </Link>
          <span>·</span>
          <Link href="/" className="text-slate-600 hover:underline">
            ← {isHi ? 'होमपेज' : 'Home'}
          </Link>
        </div>
      </main>
    </div>
  );
}
