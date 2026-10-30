import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  Phone,
  Camera,
  Eye,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Clock,
  FileSpreadsheet,
  Smartphone,
} from 'lucide-react';
import { auth } from '@/auth';
import { LanguageToggle } from '@/components/language-toggle';
import { ContactForm } from './contact-form';
import { ScrollCraftStoryRuntime } from './scrollcraft-story-runtime';

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

  const locale = await getLocale();
  const isHi = locale === 'hi';
  const t = await getTranslations('marketing');

  const copy = {
    folioStart: isHi ? 'I · गेट प्रवेश' : 'I · The Gate',
    loginBtn: isLoggedIn
      ? isHi
        ? 'ऐप खोलें'
        : 'Open app'
      : isHi
        ? 'लॉग इन'
        : 'Login',
    heroTitle: isHi
      ? 'हर एंट्री, हर बच्चा, सुरक्षित।'
      : 'Har entry, har bachcha, surakshit.',
    heroSub: isHi
      ? 'GateSathi सरकारी स्कूलों के लिए एक मुफ़्त डिजिटल विज़िटर रजिस्टर है।'
      : 'GateSathi is a free digital visitor register for government schools.',
    requestPilotBtn: isHi ? 'पायलट रिक्वेस्ट करें' : 'Request a pilot',

    // Floating hero card
    heroCardBadge: isHi ? 'स्वीकृत अभिभावक (Approved)' : 'Approved Guardian',
    heroCardTime: '08:15 IST',
    heroCardTitle: isHi
      ? 'सुनीता देवी (Mother) · छात्र: आरव (कक्षा 4A)'
      : 'Sunita Devi (Mother) · Student: Aarav (Class 4A)',
    heroCardSubtitle: isHi
      ? 'लाइव फ़ोटो और गार्जियन लिंक गेट पर वेरिफ़ाइड'
      : 'Live photo & guardian link verified at gate',

    // Problem section
    problemHeading: isHi
      ? 'कागज़ी रजिस्टर की समस्या'
      : 'The Paper Register Blind Spot',
    problemSub: isHi
      ? 'कागज़ी रजिस्टर हर सुबह भरता तो है, पर ज़रूरत के समय सही जानकारी नहीं देता।'
      : 'A paper register records ink, not accountability.',
    problems: [
      {
        title: isHi
          ? 'भारी-भरकम कागज़ी रजिस्टर जिन्हें संभालना और खोजना मुश्किल है।'
          : 'Heavy paper registers that tear, smudge, and are impossible to search.',
        detail: isHi
          ? 'बारिश, फटे पन्नों और ख़राब लिखावट में सुरक्षा का पुराना रिकॉर्ड खो जाता है।'
          : 'Critical visitor entries get lost across ink smudges and missing pages.',
      },
      {
        title: isHi
          ? 'यह जानने का कोई तरीक़ा नहीं कि कौन व्यक्ति किस बच्चे से मिला।'
          : 'No way to know who met which child at the school gate.',
        detail: isHi
          ? 'रजिस्टर में सिर्फ़ नाम लिखा होता है, छात्र से सही रिश्ते का कोई वेरिफ़िकेशन नहीं होता।'
          : 'Paper logs record a name with zero verification against approved guardians.',
      },
      {
        title: isHi
          ? 'प्रिंसिपल के पास परिसर की वर्तमान स्थिति का कोई लाइव दृश्य नहीं होता।'
          : 'Principal has no live view of who is inside the campus.',
        detail: isHi
          ? 'बिना गेट पर गए ऑफ़िस से यह पता नहीं चलता कि अभी स्कूल के अंदर कौन-कौन विज़िटर मौजूद हैं।'
          : 'Without walking to the gate, there is no visibility into active visitors.',
      },
    ],

    // How it works
    howHeading: isHi ? 'GateSathi कैसे काम करता है' : 'How GateSathi Works',
    howSub: isHi
      ? 'गेट पर सिर्फ़ 15 सेकंड का प्रोसेस, और प्रिंसिपल को पूरे दिन का लाइव अपडेट।'
      : 'A 15-second flow at the gate gives the principal full-day visibility.',
    passHeading: isHi ? 'लाइव गेट पास' : 'LIVE GATE PASS',
    passStep1Title: isHi
      ? 'स्टेप 1 · मोबाइल: 98765 43210'
      : 'Step 1 · Mobile: 98765 43210',
    passStep1Sub: isHi
      ? 'रजिस्टर्ड पिता: राजेश कुमार · बच्चे: आरव (4A), अनन्या (2B)'
      : 'Registered Father: Rajesh Kumar · Siblings: Aarav (4A), Ananya (2B)',
    passStep2Title: isHi
      ? 'स्टेप 2 · लाइव फ़ोटो (~150 KB) + गार्जियन चेक'
      : 'Step 2 · Live Photo (~150 KB) + Guardian Check',
    passStep2Sub: isHi
      ? '✓ स्वीकृत अभिभावक (Approved Guardian - छात्र रिकॉर्ड से मैच)'
      : '✓ Approved Guardian (Matched with student record)',
    passStep3Title: isHi
      ? 'स्टेप 3 · प्रिंसिपल लाइव व्यू (/gate/inside)'
      : 'Step 3 · Principal Live View (/gate/inside)',
    passStep3Sub: isHi
      ? 'अभी परिसर में (Inside Now) · शाम 17:05 IST पर ऑटो-क्लोज़'
      : 'Inside Campus Now · Automated daily closure at 17:05 IST',

    steps: [
      {
        icon: Phone,
        cue: '0 0.38 0',
        title: isHi
          ? '1. गार्ड फ़ोन नंबर दर्ज करता है'
          : '1. Guard enters phone number',
        desc: isHi
          ? 'विज़िटर का 10-अंकीय मोबाइल नंबर डालते ही रजिस्टर्ड पैरेंट्स और भाई-बहन (Siblings) एक टैप में आ जाते हैं। नए विज़िटर्स के लिए 6-अंकीय OTP और DPDP सहमति दर्ज होती है।'
          : 'Entering the 10-digit mobile number immediately loads known visitors and linked siblings in one tap. First-time visitors verify via 6-digit OTP and DPDP consent.',
      },
      {
        icon: Camera,
        cue: '0.32 0.72',
        title: isHi
          ? '2. फ़ोटो और स्टूडेंट लिंक, गार्जियन लिस्ट की जाँच'
          : '2. Photo + student linked, guardian list checked',
        desc: isHi
          ? 'रियर कैमरे से तुरंत लाइव फ़ोटो (~150 KB) ली जाती है, स्टूडेंट चुना जाता है और सर्वर अप्रूव्ड गार्जियन लिस्ट चेक करता है। अन-अप्रूव्ड पिकअप पर रीज़न चिप्स और डबल कन्फर्मेशन ज़रूरी है।'
          : 'A live rear-camera photo (~150 KB compressed) is captured, students are linked, and the server checks the approved guardian list. Unapproved pickups require reason chips and a second confirmation.',
      },
      {
        icon: Eye,
        cue: '0.66 1',
        title: isHi
          ? '3. प्रिंसिपल इसे लाइव देखते हैं'
          : '3. Principal sees it live',
        desc: isHi
          ? 'प्रिंसिपल को अपने मोबाइल पर तुरंत दिखता है कि कैंपस में कौन है, किस बच्चे से मिलने आया है, और क्या बच्चे के साथ निकला। शाम 17:05 IST पर खुली विज़िट्स अपने आप बंद हो जाती हैं।'
          : 'The principal sees in real time who is inside campus, which child they are visiting, and whether they left with the student, with automated daily closure at 17:05 IST.',
      },
    ],

    // Features
    featuresHeading: isHi ? 'प्रमुख सुविधाएं' : 'Key Capabilities',
    featuresSub: isHi
      ? 'सरकारी स्कूलों की सुरक्षा ज़रूरतों को ध्यान में रखकर तैयार किए गए 6 मुख्य फीचर्स।'
      : 'Six capabilities engineered for government school safety.',
    features: [
      {
        icon: Smartphone,
        title: isHi
          ? 'पुराने विज़िटर की एक टैप में एंट्री'
          : 'Repeat visitor in one tap',
        desc: isHi
          ? '10-अंकीय नंबर डालते ही विज़िटर की प्रोफ़ाइल और स्कूल में पढ़ने वाले सभी भाई-बहन स्क्रीन पर।'
          : '10-digit lookup recalls profile and linked siblings immediately.',
      },
      {
        icon: UserCheck,
        title: isHi
          ? 'हर छात्र के लिए अप्रूव्ड गार्जियन लिस्ट'
          : 'Approved guardian list per student',
        desc: isHi
          ? 'माता-पिता और अधिकृत रिश्तेदारों का सर्वर-लेवल वेरिफिकेशन।'
          : 'Server-verified guardian links for parents and authorized relatives.',
      },
      {
        icon: AlertTriangle,
        title: isHi
          ? 'अन-अप्रूव्ड विज़िटर्स पर तुरंत अलर्ट'
          : 'Unapproved visitors flagged',
        desc: isHi
          ? 'रिश्तेदार, पड़ोसी, ड्राइवर जैसे रीज़न चिप्स और पिकअप पर दोबारा पुष्टि अनिवार्य।'
          : 'Structured reason chips and mandatory double confirmation on pickup.',
      },
      {
        icon: Clock,
        title: isHi
          ? 'कैंपस में कौन है — लाइव हेडकाउंट'
          : 'Who is inside now',
        desc: isHi
          ? 'एक टैप में एग्ज़िट मार्क करें, साथ ही शाम 17:05 IST पर ऑटो-क्लोज़ सुविधा।'
          : 'One-tap exit marking, student departure flag, and 17:05 IST auto-close.',
      },
      {
        icon: FileSpreadsheet,
        title: isHi
          ? 'पूरा रिकॉर्ड और एक्सेल / CSV डाउनलोड'
          : 'Full history and export',
        desc: isHi
          ? '5,000 छात्रों तक का बल्क इम्पोर्ट और एक क्लिक में पूरी विज़िटर रिपोर्ट।'
          : 'Bulk 5,000-row CSV/Excel student-guardian import and CSV reports.',
      },
      {
        icon: CheckCircle2,
        title: isHi
          ? 'किसी भी साधारण एंड्रॉइड फ़ोन पर चलता है'
          : 'Works in Hindi on any basic phone',
        desc: isHi
          ? 'कमज़ोर 3G नेटवर्क और बेसिक स्मार्टफ़ोन पर भी सुपरफ़ास्ट काम करने के लिए डिज़ाइन किया गया।'
          : 'Engineered for basic Android devices and low-bandwidth school gates.',
      },
    ],

    // Privacy
    privacyHeading: isHi
      ? 'प्राइवेसी और डेटा सुरक्षा'
      : 'Privacy and Data Safety',
    privacyPoints: [
      isHi
        ? 'पूरा डेटा भारत के सुरक्षित सर्वरों में स्टोर होता है।'
        : 'Data is stored securely in India.',
      isHi
        ? 'DPDP एक्ट 2023 और रूल्स 2025 के कड़े नियमों के अनुसार तैयार।'
        : 'Built for the DPDP Act 2023 and Rules 2025.',
      isHi
        ? 'कोई आधार नंबर नहीं, कोई फ़ेशियल रिकग्निशन स्कैनिंग नहीं।'
        : 'No Aadhaar, no face recognition.',
      isHi
        ? 'तय समय सीमा के बाद विज़िटर्स की फ़ोटो अपने आप डिलीट हो जाती हैं।'
        : 'Photos auto-deleted after a fixed period.',
      isHi
        ? 'पूरे डेटा का 100% मालिकाना हक़ सिर्फ़ विद्यालय के पास होता है।'
        : 'Data belongs to the school.',
    ],

    // Gov statement
    govHeading: isHi ? 'सरकारी विद्यालयों के लिए' : 'For Government Schools',
    govStatement: isHi
      ? 'सरकारी स्कूलों के लिए 100% मुफ़्त।'
      : 'Free for government schools.',

    // Contact form
    contactHeading: isHi
      ? 'पायलट के लिए संपर्क करें'
      : 'Contact / Request a Pilot',
    contactSub: isHi
      ? 'अपने स्कूल में GateSathi शुरू करने के लिए नीचे फ़ॉर्म भरें।'
      : 'Fill in your school details below to request a pilot for your school.',

    // Footer
    footerPrivacy: isHi ? 'गोपनीयता नीति' : 'Privacy Policy',
  };

  return (
    <div
      id="gatesathi-story-root"
      className="min-h-dvh bg-slate-50 text-slate-900"
    >
      <div data-sc-progress aria-hidden="true" />
      <ScrollCraftStoryRuntime />

      {/* 1. Header */}
      <header className="sticky top-0 z-40 border-b border-white/15 bg-brand-blue text-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
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
            <span
              data-story-folio
              className="hidden rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-white/90 md:inline-block"
            >
              {copy.folioStart}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <LanguageToggle onBrandBlue />
            <Link
              href={isLoggedIn ? '/app' : '/login'}
              className="inline-flex h-8 items-center justify-center rounded-md bg-white px-3 text-xs font-semibold text-brand-blue shadow-sm hover:bg-slate-100"
            >
              {copy.loginBtn}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* 2. Hero: Dimensional Layered Hero with Independent Visual Planes */}
        <section
          data-sc-act="flow"
          className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-amber-50/60 via-white to-slate-100 py-10 sm:py-16"
        >
          {/* Back Atmospheric Plane */}
          <div
            data-sc-parallax="-0.6"
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 right-0 h-80 w-80 rounded-full bg-amber-200/30 blur-3xl"
          />

          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 lg:grid-cols-12">
            {/* Copy Plane */}
            <div className="space-y-5 lg:col-span-6">
              <Image
                src="/brand/logo-horizontal.png"
                alt="GateSathi"
                width={220}
                height={73}
                priority
                className="h-auto w-[200px] sm:w-[220px]"
              />

              <div className="space-y-2">
                <h1 className="text-2xl font-extrabold tracking-tight text-brand-blue sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]">
                  {copy.heroTitle}
                </h1>
                <p className="max-w-xl text-sm font-medium leading-relaxed text-slate-700 sm:text-base">
                  {copy.heroSub}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href={isLoggedIn ? '/app' : '/login'}
                  className="inline-flex h-11 items-center justify-center rounded-md bg-brand-blue px-6 text-sm font-semibold text-white shadow-sm hover:bg-brand-blue/90"
                >
                  {copy.loginBtn}
                </Link>
                <a
                  href="#contact"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                >
                  {copy.requestPilotBtn}
                </a>
              </div>
            </div>

            {/* Dimensional Visual Stack */}
            <div className="relative lg:col-span-6">
              <div
                data-sc-parallax="-0.25"
                className="overflow-hidden rounded-2xl border-2 border-white bg-slate-900 shadow-xl"
              >
                <Image
                  src="/story/01-school-gate-hero.jpg"
                  alt="Indian government school guard welcoming parent and child at the school gate"
                  width={1280}
                  height={720}
                  priority
                  className="h-auto w-full object-cover"
                />
              </div>

              {/* Floating Gate Pass Verification Card */}
              <div
                data-sc-parallax="0.3"
                className="mt-3 rounded-xl border border-slate-200 bg-white/95 p-3.5 shadow-lg backdrop-blur sm:absolute sm:-bottom-5 sm:left-4 sm:mt-0 sm:max-w-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
                    <CheckCircle2
                      className="h-3.5 w-3.5 text-emerald-700"
                      aria-hidden="true"
                    />
                    {copy.heroCardBadge}
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-slate-600">
                    {copy.heroCardTime}
                  </span>
                </div>
                <p className="mt-1.5 text-xs font-bold text-slate-900">
                  {copy.heroCardTitle}
                </p>
                <p className="text-[11px] text-slate-600">
                  {copy.heroCardSubtitle}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Problem: The Paper Register Blind Spot */}
        <section
          data-sc-act="flow"
          className="border-b border-slate-200 bg-white py-12 sm:py-16"
        >
          <div className="mx-auto max-w-6xl px-4">
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <div
                  data-sc-reveal="up"
                  data-sc-reveal-at="0.08 0.48"
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-md"
                >
                  <Image
                    src="/story/02-paper-register-problem.jpg"
                    alt="Worn paper visitor register book on a wooden desk at a school gate"
                    width={1200}
                    height={675}
                    className="h-auto w-full object-cover"
                  />
                </div>
              </div>

              <div className="space-y-4 lg:col-span-7">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
                    {copy.problemHeading}
                  </h2>
                  <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                    {copy.problemSub}
                  </p>
                </div>

                <ul
                  data-sc-in
                  data-sc-stagger="80"
                  className="grid grid-cols-1 gap-3.5"
                >
                  {copy.problems.map((item, idx) => (
                    <li
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <p className="text-sm font-bold text-slate-900">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {item.detail}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 4. How It Works: Pinned Peak Act + Bespoke Live Gate Pass Signature Move */}
        <section
          id="act-how-it-works"
          data-sc-act="pin"
          data-sc-span="2.4"
          className="border-b border-slate-200 bg-brand-blue text-white"
        >
          <div
            data-sc-stage
            className="sc-stage flex items-center py-8 sm:py-12"
          >
            <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-8 px-4 lg:grid-cols-12">
              {/* Left Column: Guard Verification Photograph + Bespoke Live Gate Pass */}
              <div className="space-y-4 lg:col-span-5">
                <div className="overflow-hidden rounded-xl border border-white/20 bg-slate-900 shadow-lg">
                  <Image
                    src="/story/03-guard-phone-verification.jpg"
                    alt="School security guard verifying parent and student on phone at gate"
                    width={1200}
                    height={675}
                    className="h-44 w-full object-cover sm:h-52"
                  />
                </div>

                {/* Bespoke Signature Move: Scroll-Driven Gate Pass */}
                <div
                  data-gatesathi-pass
                  data-pass-stage="1"
                  className="rounded-xl border border-white/25 bg-slate-950/90 p-4 text-white shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-white/15 pb-2.5">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">
                      {copy.passHeading}
                    </span>
                    <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[11px] text-white/90">
                      /gate → /dashboard
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div
                      data-pass-step="1"
                      className="rounded-lg border border-white/15 p-2.5"
                    >
                      <p className="text-xs font-bold text-white">
                        {copy.passStep1Title}
                      </p>
                      <p className="text-[11px] text-white/80">
                        {copy.passStep1Sub}
                      </p>
                    </div>

                    <div
                      data-pass-step="2"
                      className="rounded-lg border border-white/15 p-2.5"
                    >
                      <p className="text-xs font-bold text-white">
                        {copy.passStep2Title}
                      </p>
                      <p className="text-[11px] text-emerald-300">
                        {copy.passStep2Sub}
                      </p>
                    </div>

                    <div
                      data-pass-step="3"
                      className="rounded-lg border border-white/15 p-2.5"
                    >
                      <p className="text-xs font-bold text-white">
                        {copy.passStep3Title}
                      </p>
                      <p className="text-[11px] text-amber-300">
                        {copy.passStep3Sub}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: The 3 Steps */}
              <div className="space-y-4 lg:col-span-7">
                <div>
                  <h2 className="text-xl font-extrabold text-white sm:text-3xl">
                    {copy.howHeading}
                  </h2>
                  <p className="mt-1 text-xs text-white/85 sm:text-sm">
                    {copy.howSub}
                  </p>
                </div>

                <div className="space-y-3">
                  {copy.steps.map((step) => {
                    const Icon = step.icon;
                    return (
                      <div
                        key={step.title}
                        data-sc-cue={step.cue}
                        className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-slate-950">
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </div>
                          <div className="space-y-1">
                            <h3 className="text-sm font-bold text-white sm:text-base">
                              {step.title}
                            </h3>
                            <p className="pt-0.5 text-xs leading-relaxed text-white/90">
                              {step.desc}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Features Grid / Horizontal Pan Rail */}
        <section
          data-sc-act="pan"
          data-sc-span="2.2"
          className="border-b border-slate-200 bg-slate-100"
        >
          <div
            data-sc-stage
            className="sc-stage flex flex-col justify-center py-10"
          >
            <div className="mx-auto mb-6 w-full max-w-6xl px-4">
              <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
                {copy.featuresHeading}
              </h2>
              <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                {copy.featuresSub}
              </p>
            </div>

            <div className="px-4 sm:px-8">
              <div
                data-sc-pan="0.06"
                className="flex flex-col gap-4 sm:flex-row sm:w-max"
              >
                {copy.features.map((feat) => {
                  const Icon = feat.icon;
                  return (
                    <article
                      key={feat.title}
                      className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:w-[320px]"
                    >
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-blue text-white">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <h3 className="mt-3 text-sm font-bold text-slate-900">
                        {feat.title}
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">
                        {feat.desc}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* 6. Privacy and Safety */}
        <section
          data-sc-act="flow"
          className="border-b border-slate-200 bg-white py-12 sm:py-16"
        >
          <div className="mx-auto max-w-6xl px-4">
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
              <div className="space-y-4 lg:col-span-6">
                <div className="flex items-center gap-2">
                  <ShieldCheck
                    className="h-6 w-6 text-brand-blue"
                    aria-hidden="true"
                  />
                  <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
                    {copy.privacyHeading}
                  </h2>
                </div>

                <ul
                  data-sc-in
                  data-sc-stagger="70"
                  className="space-y-2.5 text-sm text-slate-800"
                >
                  {copy.privacyPoints.map((pt, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <p className="font-semibold text-slate-900">{pt}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="lg:col-span-6">
                <div
                  data-sc-in
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-lg"
                >
                  <Image
                    src="/story/04-principal-live-peace.jpg"
                    alt="Government school principal viewing live campus status on her phone"
                    width={1200}
                    height={675}
                    className="h-auto w-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. For Government Schools */}
        <section className="border-b border-slate-200 bg-brand-blue py-10 text-white sm:py-12">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-300 sm:text-sm">
              {copy.govHeading}
            </h2>
            <p className="mt-1.5 text-2xl font-extrabold text-white sm:text-3xl">
              {copy.govStatement}
            </p>
          </div>
        </section>

        {/* 8. Contact / Request a Pilot */}
        <section id="contact" className="bg-white py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
              {copy.contactHeading}
            </h2>
            <p className="mt-1 mb-6 text-xs text-slate-600 sm:text-sm">
              {copy.contactSub}
            </p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 sm:p-6 shadow-sm">
              <ContactForm
                labels={{
                  fieldName: isHi ? 'आपका नाम' : 'Your Name',
                  fieldSchool: isHi ? 'स्कूल का नाम' : 'School Name',
                  fieldRole: isHi
                    ? 'पद (प्रिंसिपल / शिक्षक / अधिकारी)'
                    : 'Role (Principal / Teacher / Officer)',
                  fieldPhone: isHi
                    ? '10 अंकों का मोबाइल नंबर'
                    : '10-Digit Mobile Number',
                  fieldMessage: isHi ? 'संदेश (वैकल्पिक)' : 'Message (optional)',
                  submitPilotBtn: isHi
                    ? 'पायलट रिक्वेस्ट भेजें'
                    : 'Request a pilot',
                  submittingPilot: isHi ? 'भेजा जा रहा है...' : 'Submitting...',
                  thankYouMessage: isHi
                    ? 'धन्यवाद! आपका पायलट अनुरोध प्राप्त हो गया है। हम जल्द ही आपसे संपर्क करेंगे।'
                    : 'Thank you! Your pilot request has been saved. We will get in touch soon.',
                  errorMessage: isHi
                    ? 'कृपया सभी आवश्यक फ़ील्ड और 10 अंकों का सही मोबाइल नंबर भरें।'
                    : 'Please fill in all required fields and a valid 10-digit mobile number.',
                  rateLimitMessage: isHi
                    ? 'बहुत अधिक अनुरोध। कृपया कुछ समय बाद पुनः प्रयास करें।'
                    : 'Too many requests. Please try again later.',
                }}
              />
            </div>
          </div>
        </section>
      </main>

      {/* 9. Footer */}
      <footer className="border-t border-slate-200 bg-slate-100 py-6 text-xs text-slate-600">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="font-bold text-brand-blue">GateSathi</span>
            <span>·</span>
            <span>{t('footerBuiltBy')}</span>
          </div>
          <Link
            href="/privacy"
            className="font-medium text-brand-blue underline-offset-2 hover:underline"
          >
            {copy.footerPrivacy}
          </Link>
        </div>
      </footer>
    </div>
  );
}
