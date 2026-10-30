import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { LanguageToggle } from '@/components/language-toggle';
import { DemoShowcase } from '@/components/demo-showcase';
import Image from 'next/image';

export const metadata = {
  title: 'GateSathi Principal Admin Dashboard Demo | प्रधानाचार्य डैशबोर्ड डेमो',
  description: 'Live interactive desktop dashboard demo of GateSathi live headcount, visitor logs, and safety oversight.',
};

export default async function AdminDemoPage() {
  const locale = (await getLocale()) as 'hi' | 'en';
  const isHi = locale === 'hi';

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 pb-12">
      <header className="border-b border-slate-200 bg-brand-blue text-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
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

      <main className="mx-auto max-w-5xl px-4 pt-6">
        <div className="mb-4 text-center">
          <span className="inline-block rounded-full bg-blue-100 px-3 py-0.5 text-xs font-bold text-brand-blue">
            {isHi ? '💻 प्रधानाचार्य एडमिन डैशबोर्ड' : '💻 Principal Admin Dashboard'}
          </span>
          <h1 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">
            {isHi ? 'कार्यालय से लाइव सुरक्षा अवलोकन व उपस्थिति' : 'Live Campus Safety Oversight & Attendance'}
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            {isHi
              ? 'वर्तमान में परिसर में उपस्थित व्यक्तियों की वास्तविक संख्या देखें और एक क्लिक में निकास दर्ज करें।'
              : 'Monitor real-time visitors inside the campus and export safety audit records.'}
          </p>
        </div>

        <DemoShowcase initialTab="admin" locale={locale} standalone />

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold">
          <Link href="/demo/mobile" className="text-brand-blue hover:underline">
            📱 {isHi ? 'मोबाइल गार्ड डेमो देखें →' : 'Switch to Mobile Guard Demo →'}
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
