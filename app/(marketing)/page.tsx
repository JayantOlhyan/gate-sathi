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

  const bi = (hi: string, en: string) =>
    isHi ? { primary: hi, secondary: en } : { primary: en, secondary: hi };

  const heroTitle = bi(
    'हर एंट्री, हर बच्चा, सुरक्षित।',
    'Har entry, har bachcha, surakshit.'
  );
  const heroSub = bi(
    'GateSathi सरकारी विद्यालयों के लिए एक निःशुल्क डिजिटल आगंतुक रजिस्टर है।',
    'GateSathi is a free digital visitor register for government schools.'
  );

  const problems = [
    {
      ...bi(
        'भारी कागज़ी रजिस्टर जिन्हें संभालना और समय पर खोजना कठिन है।',
        'Heavy paper register that tears, smudges, and is impossible to search.'
      ),
      detail: bi(
        'बारिश, फटे पन्नों और अधूरी लिखावट में सुरक्षा रिकॉर्ड खो जाते हैं।',
        'Critical visitor entries get lost across ink smudges and missing pages.'
      ),
    },
    {
      ...bi(
        'यह जानने का कोई तरीका नहीं कि किस व्यक्ति ने किस बच्चे से मुलाकात की।',
        'No way to know who met which child at the school gate.'
      ),
      detail: bi(
        'कागज़ पर केवल नाम लिखा होता है, छात्र से स्वीकृत संबंध का कोई प्रमाण नहीं।',
        'Paper logs record a name with zero verification against approved guardians.'
      ),
    },
    {
      ...bi(
        'प्रधानाचार्य के पास परिसर की वर्तमान स्थिति का कोई लाइव दृश्य नहीं होता।',
        'Principal has no live view of who is inside the campus.'
      ),
      detail: bi(
        'कार्यालय से गेट तक जाए बिना यह पता नहीं चलता कि कौन परिसर के अंदर है।',
        'Without walking to the gate, there is no visibility into active visitors.'
      ),
    },
  ];

  const steps = [
    {
      icon: Phone,
      cue: '0 0.38 0',
      ...bi(
        '1. गार्ड फ़ोन नंबर दर्ज करता है',
        '1. Guard enters phone number'
      ),
      desc: bi(
        'आगंतुक का 10-अंकीय मोबाइल नंबर लिखते ही पंजीकृत अभिभावक और भाई-बहन (Siblings) एक टैप में दिखते हैं। नए आगंतुकों के लिए 6-अंकीय OTP और द्विभाषी DPDP सहमति दर्ज होती है।',
        'Entering the 10-digit mobile number immediately loads known visitors and linked siblings in one tap. First-time visitors verify via 6-digit OTP and bilingual DPDP consent.'
      ),
    },
    {
      icon: Camera,
      cue: '0.32 0.72',
      ...bi(
        '2. फ़ोटो और छात्र लिंक, अभिभावक सूची की जाँच',
        '2. Photo + student linked, guardian list checked'
      ),
      desc: bi(
        'रियर कैमरे से लाइव फ़ोटो (~150 KB संपीड़ित) ली जाती है, छात्र चुना जाता है और सर्वर पर स्वीकृत अभिभावक सूची की जाँच होती है। अस्वीकृत व्यक्ति द्वारा Pickup चुनने पर कारण चिप्स और दोहरी पुष्टि अनिवार्य है।',
        'A live rear-camera photo (~150 KB compressed) is captured, students are linked, and the server checks the approved guardian list. Unapproved pickups require reason chips and a second confirmation.'
      ),
    },
    {
      icon: Eye,
      cue: '0.66 1',
      ...bi(
        '3. प्रधानाचार्य इसे लाइव देखते हैं',
        '3. Principal sees it live'
      ),
      desc: bi(
        'प्रधानाचार्य को अपने फ़ोन पर तुरंत दिखता है कि परिसर में कौन है, किस छात्र से मिलने आया है, और क्या छात्र के साथ प्रस्थान किया। शाम 17:05 IST पर खुले रिकॉर्ड स्वतः बंद होते हैं।',
        'The principal sees in real time who is inside campus, which child they are visiting, and whether they left with the student, with automated daily closure at 17:05 IST.'
      ),
    },
  ];

  const features = [
    {
      icon: Smartphone,
      ...bi(
        'दोबारा आने वाले आगंतुक का एक टैप में प्रवेश।',
        'Repeat visitor in one tap.'
      ),
      sub: bi(
        '10-अंकीय नंबर से प्रोफ़ाइल और जुड़े भाई-बहन तुरंत स्क्रीन पर।',
        '10-digit lookup recalls profile and linked siblings immediately.'
      ),
    },
    {
      icon: UserCheck,
      ...bi(
        'प्रत्येक छात्र के लिए स्वीकृत अभिभावक सूची।',
        'Approved guardian list per student.'
      ),
      sub: bi(
        'माता-पिता व स्वीकृत रिश्तेदारों का सर्वर-स्तरीय सत्यापन।',
        'Server-verified guardian links for parents and authorized relatives.'
      ),
    },
    {
      icon: AlertTriangle,
      ...bi(
        'अस्वीकृत आगंतुकों की तुरंत पहचान और चेतावनी।',
        'Unapproved visitors flagged.'
      ),
      sub: bi(
        'कारण चिप्स (रिश्तेदार/पड़ोसी/ड्राइवर/अन्य) और पिकअप पर दोहरी चेतावनी।',
        'Structured reason chips and mandatory double confirmation on pickup.'
      ),
    },
    {
      icon: Clock,
      ...bi(
        'अभी परिसर के अंदर कौन है, इसकी लाइव सूची।',
        'Who is inside now.'
      ),
      sub: bi(
        'एक-टैप निकास, छात्र प्रस्थान रिकॉर्ड और 17:05 IST ऑटो-क्लोज़।',
        'One-tap exit marking, student departure flag, and 17:05 IST auto-close.'
      ),
    },
    {
      icon: FileSpreadsheet,
      ...bi(
        'संपूर्ण इतिहास और डेटा एक्सपोर्ट की सुविधा।',
        'Full history and export.'
      ),
      sub: bi(
        '5,000 छात्रों तक का बल्क CSV/Excel आयात और डाउनलोड योग्य रिपोर्ट।',
        'Bulk 5,000-row CSV/Excel student-guardian import and CSV reports.'
      ),
    },
    {
      icon: CheckCircle2,
      ...bi(
        'किसी भी साधारण फ़ोन पर हिन्दी में काम करता है।',
        'Works in Hindi on any basic phone.'
      ),
      sub: bi(
        'कम नेटवर्क (3G) और सामान्य एंड्रॉइड फ़ोन के लिए विशेष रूप से निर्मित।',
        'Engineered for basic Android devices and low-bandwidth school gates.'
      ),
    },
  ];

  const privacyPoints = [
    bi(
      'संपूर्ण डेटा भारत में सुरक्षित रूप से संग्रहीत किया जाता है।',
      'Data stored in India.'
    ),
    bi(
      'DPDP अधिनियम 2023 और नियम 2025 के अनुरूप निर्मित।',
      'Built for the DPDP Act 2023 and Rules 2025.'
    ),
    bi(
      'कोई आधार (Aadhaar) नहीं, कोई फ़ेस रिकग्निशन (Face Recognition) नहीं।',
      'No Aadhaar, no face recognition.'
    ),
    bi(
      'निर्धारित अवधि के बाद फ़ोटो स्वचालित रूप से हटा दी जाती हैं।',
      'Photos auto-deleted after a fixed period.'
    ),
    bi(
      'संपूर्ण डेटा पर केवल विद्यालय का स्वामित्व होता है।',
      'Data belongs to the school.'
    ),
  ];

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
              I · द्वार / The Gate
            </span>
          </div>

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
            {/* Copy Plane (rides at 1x for crisp legibility) */}
            <div className="space-y-5 lg:col-span-6">
              <Image
                src="/brand/logo-horizontal.png"
                alt="GateSathi"
                width={220}
                height={73}
                priority
                className="h-auto w-[200px] sm:w-[220px]"
              />

              <div className="space-y-1.5">
                <h1 className="text-2xl font-extrabold tracking-tight text-brand-blue sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]">
                  {heroTitle.primary}
                </h1>
                <p className="text-base font-bold text-slate-700 sm:text-lg">
                  {heroTitle.secondary}
                </p>
              </div>

              <div className="space-y-1 max-w-xl">
                <p className="text-sm font-medium leading-relaxed text-slate-800 sm:text-base">
                  {heroSub.primary}
                </p>
                <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">
                  {heroSub.secondary}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href={isLoggedIn ? '/app' : '/login'}
                  className="inline-flex h-11 items-center justify-center rounded-md bg-brand-blue px-6 text-sm font-semibold text-white shadow-sm hover:bg-brand-blue/90"
                >
                  {isLoggedIn
                    ? 'ऐप खोलें / Open app'
                    : 'लॉग इन / Login'}
                </Link>
                <a
                  href="#contact"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                >
                  पायलट का अनुरोध करें / Request a pilot
                </a>
              </div>
            </div>

            {/* Dimensional Visual Stack: Mid Subject Plane + Foreground Gate Pass Plane */}
            <div className="relative lg:col-span-6">
              {/* Mid Plane: Morning School Gate Documentary Photograph */}
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

              {/* Foreground Plane: Floating Bilingual Gate Pass Card */}
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
                    स्वीकृत अभिभावक · Approved
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-slate-600">
                    08:15 IST
                  </span>
                </div>
                <p className="mt-1.5 text-xs font-bold text-slate-900">
                  सुनीता देवी (माता / Mother) · छात्र: आरव (कक्षा 4A)
                </p>
                <p className="text-[11px] text-slate-600">
                  Live Photo + Guardian Link Verified at Gate
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Problem: The Paper Register Blind Spot (Reveal Wipe + Staggered Bilingual Cards) */}
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
                    वर्तमान समस्या · The Paper Register Blind Spot
                  </h2>
                  <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                    कागज़ी रजिस्टर हर सुबह लिखता तो सब कुछ है, पर ज़रूरत के समय बताता कुछ नहीं। · A paper register records ink, not accountability.
                  </p>
                </div>

                <ul
                  data-sc-in
                  data-sc-stagger="80"
                  className="grid grid-cols-1 gap-3.5"
                >
                  {problems.map((item, idx) => (
                    <li
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <p className="text-sm font-bold text-slate-900">
                        {item.primary}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-brand-blue">
                        {item.secondary}
                      </p>
                      <p className="mt-1.5 text-xs text-slate-600">
                        {item.detail.primary} ({item.detail.secondary})
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

                {/* Bespoke Signature Move: Scroll-Driven Bilingual Gate Pass */}
                <div
                  data-gatesathi-pass
                  data-pass-stage="1"
                  className="rounded-xl border border-white/25 bg-slate-950/90 p-4 text-white shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-white/15 pb-2.5">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">
                      लाइव गेट पास · Live Gate Pass
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
                        चरण 1 · Mobile: 98765 43210
                      </p>
                      <p className="text-[11px] text-white/80">
                        पंजीकृत पिता: राजेश कुमार · भाई-बहन: आरव (4A), अनन्या (2B)
                      </p>
                    </div>

                    <div
                      data-pass-step="2"
                      className="rounded-lg border border-white/15 p-2.5"
                    >
                      <p className="text-xs font-bold text-white">
                        चरण 2 · Live Photo (~150 KB) + Guardian Check
                      </p>
                      <p className="text-[11px] text-emerald-300">
                        ✓ स्वीकृत अभिभावक (Approved Guardian for all selected students)
                      </p>
                    </div>

                    <div
                      data-pass-step="3"
                      className="rounded-lg border border-white/15 p-2.5"
                    >
                      <p className="text-xs font-bold text-white">
                        चरण 3 · Principal Live View (/gate/inside)
                      </p>
                      <p className="text-[11px] text-amber-300">
                        अभी परिसर में · Inside Now · शाम 17:05 IST ऑटो-क्लोज़
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: The 3 Steps in Full Bilingual Detail */}
              <div className="space-y-4 lg:col-span-7">
                <div>
                  <h2 className="text-xl font-extrabold text-white sm:text-3xl">
                    यह कैसे काम करता है · How GateSathi Works
                  </h2>
                  <p className="mt-1 text-xs text-white/85 sm:text-sm">
                    गेट पर 15 सेकंड की प्रक्रिया, प्रधानाचार्य को पूरे दिन की निश्चिंतता। · A 15-second flow at the gate gives the principal full-day visibility.
                  </p>
                </div>

                <div className="space-y-3">
                  {steps.map((step) => {
                    const Icon = step.icon;
                    return (
                      <div
                        key={step.primary}
                        data-sc-cue={step.cue}
                        className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-slate-950">
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </div>
                          <div className="space-y-1">
                            <h3 className="text-sm font-bold text-white sm:text-base">
                              {step.primary}
                            </h3>
                            <p className="text-xs font-semibold text-amber-300">
                              {step.secondary}
                            </p>
                            <p className="pt-1 text-xs leading-relaxed text-white/90">
                              {step.desc.primary}
                            </p>
                            <p className="text-[11px] leading-relaxed text-white/75">
                              {step.desc.secondary}
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

        {/* 5. Features Grid / Horizontal Pan Rail (6 Cards in Bilingual Hindi & English) */}
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
                प्रमुख सुविधाएं · Complete Feature Suite
              </h2>
              <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                सरकारी विद्यालय के प्रत्येक सुरक्षा नियम के अनुसार निर्मित 6 मुख्य स्तंभ। · Six capabilities engineered for government school safety.
              </p>
            </div>

            <div className="px-4 sm:px-8">
              <div
                data-sc-pan="0.06"
                className="flex flex-col gap-4 sm:flex-row sm:w-max"
              >
                {features.map((feat) => {
                  const Icon = feat.icon;
                  return (
                    <article
                      key={feat.primary}
                      className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:w-[320px]"
                    >
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-blue text-white">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <h3 className="mt-3 text-sm font-bold text-slate-900">
                        {feat.primary}
                      </h3>
                      <p className="mt-0.5 text-xs font-semibold text-brand-blue">
                        {feat.secondary}
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">
                        {feat.sub.primary}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                        {feat.sub.secondary}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* 6. Privacy and Safety (Documentary Spread + DPDP Act 2023) */}
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
                    गोपनीयता और डेटा सुरक्षा · Privacy and Safety
                  </h2>
                </div>

                <ul
                  data-sc-in
                  data-sc-stagger="70"
                  className="space-y-2.5 text-sm text-slate-800"
                >
                  {privacyPoints.map((pt, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <p className="font-bold text-slate-900">{pt.primary}</p>
                      <p className="text-xs text-slate-600">{pt.secondary}</p>
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
              सरकारी विद्यालयों के लिए · For Government Schools
            </h2>
            <p className="mt-1.5 text-2xl font-extrabold text-white sm:text-3xl">
              सरकारी विद्यालयों के लिए निःशुल्क। · Free for government schools.
            </p>
          </div>
        </section>

        {/* 8. Contact / Request a Pilot */}
        <section id="contact" className="bg-white py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-4">
            <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
              संपर्क करें / पायलट का अनुरोध करें · Contact / Request a Pilot
            </h2>
            <p className="mt-1 mb-6 text-xs text-slate-600 sm:text-sm">
              अपने विद्यालय में GateSathi पायलट शुरू करने के लिए नीचे विवरण भरें। · Fill in your school details below to request a pilot for your school.
            </p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 sm:p-6 shadow-sm">
              <ContactForm
                labels={{
                  fieldName: `${t('fieldName')} / Your Name`,
                  fieldSchool: `${t('fieldSchool')} / School Name`,
                  fieldRole: `${t('fieldRole')} / Role`,
                  fieldPhone: `${t('fieldPhone')} / 10-Digit Phone`,
                  fieldMessage: `${t('fieldMessage')} / Message`,
                  submitPilotBtn: `${t('submitPilotBtn')} / Request a pilot`,
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
            गोपनीयता नीति · Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  );
}
