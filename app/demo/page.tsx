import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { LanguageToggle } from '@/components/language-toggle';
import { DemoShowcase } from '@/components/demo-showcase';
import Image from 'next/image';

export const metadata = {
  title: 'GateSathi Live Interactive Demo | स्कूल सुरक्षा रजिस्टर',
  description: 'Experience GateSathi from the perspective of a school security guard on mobile and a principal on the admin dashboard.',
};

export default async function DemoHubPage() {
  const locale = (await getLocale()) as 'hi' | 'en';
  const isHi = locale === 'hi';

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-brand-blue text-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/brand/logo-horizontal-white.png"
              alt="GateSathi"
              width={140}
              height={32}
              className="h-7 w-auto object-contain"
              priority
            />
          </Link>
          <div className="flex items-center gap-3">
            <LanguageToggle onBrandBlue />
            <Link
              href="/login"
              className="rounded-lg bg-white px-3.5 py-1.5 text-xs font-bold text-brand-blue shadow hover:bg-slate-100"
            >
              {isHi ? 'लॉग इन' : 'Login'}
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 text-center">
          <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-brand-blue">
            {isHi ? 'लाइव इंटरैक्टिव डेमो (Interactive Live Demo)' : 'Live Interactive Demo'}
          </span>
          <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
            {isHi ? 'GateSathi कैसे कार्य करता है — लाइव अनुभव' : 'Experience How GateSathi Works in Real Time'}
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-2xl mx-auto">
            {isHi
              ? 'गेट पर सुरक्षा गार्ड के मोबाइल फ़ोन और कार्यालय में प्रधानाचार्य के एडमिन डैशबोर्ड — दोनों का सीधा डेमो यहाँ देखें।'
              : 'Test both experiences: the security guard mobile phone at the gate and the school principal admin dashboard.'}
          </p>
        </div>

        {/* Demo Showcase Component */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-8 shadow-sm">
          <DemoShowcase initialTab="mobile" locale={locale} standalone />
        </div>

        {/* Access Key Footer in Demo */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>🔑</span>
            <span>{isHi ? 'सिस्टम टेस्ट लॉगिन कुंजी (Live Credentials Key)' : 'System Test Login Credentials Key'}</span>
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            {isHi
              ? 'यदि आप सीधे ऐप के अंदर लॉगिन करके वास्तविक इंटरफ़ेस का परीक्षण करना चाहते हैं, तो इन क्रेडेंशियल्स का उपयोग करें:'
              : 'If you want to log into the live application directly, use these verified test credentials:'}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <span className="font-bold text-slate-800">📱 {isHi ? 'गार्ड (सुरक्षा कर्मी)' : 'Guard (Gate)'}</span>
              <p className="mt-1 font-mono text-slate-900">Phone: 9999999992</p>
              <p className="font-mono text-slate-600">PIN: Password@123</p>
              <Link href="/login" className="mt-2 inline-block font-bold text-brand-blue hover:underline">
                {isHi ? 'गार्ड लॉगिन करें →' : 'Log in as Guard →'}
              </Link>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <span className="font-bold text-slate-800">🏫 {isHi ? 'प्रधानाचार्य (एडमिन)' : 'Principal (Admin)'}</span>
              <p className="mt-1 font-mono text-slate-900">Phone: 9999999991</p>
              <p className="font-mono text-slate-600">PIN: Password@123</p>
              <Link href="/login" className="mt-2 inline-block font-bold text-brand-blue hover:underline">
                {isHi ? 'प्रधानाचार्य लॉगिन करें →' : 'Log in as Principal →'}
              </Link>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <span className="font-bold text-slate-800">🛡️ {isHi ? 'सुपर एडमिन (राज्य)' : 'Super Admin (State)'}</span>
              <p className="mt-1 font-mono text-slate-900">Phone: 9999999990</p>
              <p className="font-mono text-slate-600">PIN: Password@123</p>
              <p className="text-[11px] text-amber-800 font-semibold mt-1">OTP: 000000 (Test Mode)</p>
            </div>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-6 text-center">
          <Link href="/" className="text-sm font-semibold text-brand-blue hover:underline">
            ← {isHi ? 'होमपेज पर वापस जाएँ' : 'Back to Home'}
          </Link>
        </div>
      </main>
    </div>
  );
}
