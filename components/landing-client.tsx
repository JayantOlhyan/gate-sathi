'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ShieldCheck,
  Smartphone,
  Camera,
  UserCheck,
  Clock,
  FileSpreadsheet,
  Lock,
  ArrowRight,
  KeyRound,
  Building2,
} from 'lucide-react';
import { loginAction, logoutAction } from '@/app/actions/auth';
import { loginSchema, type Role } from '@/lib/validations';
import { LanguageToggle } from '@/components/language-toggle';
import { PwaInstallBanner } from '@/components/pwa-install-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export interface LandingSessionUser {
  id: string;
  phone: string;
  role: Role;
}

export function LandingClient({
  sessionUser,
}: {
  sessionUser: LandingSessionUser | null;
}) {
  const t = useTranslations('landing');
  const tLogin = useTranslations('login');
  const tApp = useTranslations('app');
  const router = useRouter();

  const [loginTab, setLoginTab] = useState<'admin' | 'guard'>('admin');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errorKey, setErrorKey] = useState<
    'validationError' | 'invalidCredentials' | 'lockedAccount' | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const handleLoginSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorKey(null);

    const parsed = loginSchema.safeParse({ phone, password });
    if (!parsed.success) {
      setErrorKey('validationError');
      return;
    }

    startTransition(async () => {
      const result = await loginAction(parsed.data);
      if (!result.ok) {
        setErrorKey(result.errorCode ?? 'invalidCredentials');
        return;
      }
      router.push(result.redirectTo ?? '/gate');
      router.refresh();
    });
  };

  const features = [
    {
      icon: Smartphone,
      title: t('f1Title'),
      desc: t('f1Desc'),
      route: '/gate',
    },
    {
      icon: KeyRound,
      title: t('f2Title'),
      desc: t('f2Desc'),
      route: '/gate',
    },
    {
      icon: Camera,
      title: t('f3Title'),
      desc: t('f3Desc'),
      route: '/gate',
    },
    {
      icon: UserCheck,
      title: t('f4Title'),
      desc: t('f4Desc'),
      route: '/gate',
    },
    {
      icon: Clock,
      title: t('f5Title'),
      desc: t('f5Desc'),
      route: '/gate/inside',
    },
    {
      icon: FileSpreadsheet,
      title: t('f6Title'),
      desc: t('f6Desc'),
      route: '/students',
    },
    {
      icon: Lock,
      title: t('f7Title'),
      desc: t('f7Desc'),
      route: '/dashboard',
    },
  ];

  const isAdmin =
    sessionUser?.role === 'principal' || sessionUser?.role === 'super_admin';

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-white/15 bg-brand-blue text-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/brand/icon-white.png"
              alt="GateSathi"
              width={36}
              height={36}
              priority
              className="h-9 w-9 shrink-0"
            />
            <div className="flex flex-col">
              <span className="text-lg font-bold leading-none tracking-tight text-white">
                GateSathi
              </span>
              <span className="mt-0.5 text-[11px] font-medium text-white/80">
                {tApp('subtitle')}
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-white/90 md:flex">
            <a href="#features" className="hover:text-white">
              {t('navFeatures')}
            </a>
            <a href="#workflow" className="hover:text-white">
              {t('navWorkflow')}
            </a>
            <a href="#login-portal" className="hover:text-white">
              {t('navLogin')}
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <LanguageToggle onBrandBlue />
            {sessionUser ? (
              <>
                <Link
                  href={isAdmin ? '/dashboard' : '/gate'}
                  className="hidden h-9 items-center rounded-md bg-amber-500 px-3 text-xs font-semibold text-slate-950 shadow-sm hover:bg-amber-400 sm:inline-flex"
                >
                  {t('openAppBtn')}
                </Link>
                <form action={logoutAction}>
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="h-9 border border-white/40 bg-transparent px-3 text-xs font-medium text-white hover:bg-white/15 hover:text-white"
                  >
                    {tApp('logout')}
                  </Button>
                </form>
              </>
            ) : (
              <a
                href="#login-portal"
                className="inline-flex h-9 items-center rounded-md bg-amber-500 px-3.5 text-xs font-semibold text-slate-950 shadow-sm hover:bg-amber-400"
              >
                {t('navLogin')}
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Hero + Admin/Guard Login Section */}
      <section className="border-b border-slate-200 bg-gradient-to-b from-white to-slate-100 py-10 sm:py-14">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 px-4 sm:px-6 lg:grid-cols-12">
          {/* Left Column: Brand Value Proposition & PWA Download */}
          <div className="space-y-6 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 py-1 text-xs font-semibold text-brand-blue">
              <ShieldCheck className="h-4 w-4 shrink-0 text-brand-blue" />
              <span>{t('heroBadge')}</span>
            </div>

            <div className="space-y-3">
              <Image
                src="/brand/logo-horizontal.png"
                alt="GateSathi"
                width={260}
                height={86}
                priority
                className="h-auto w-[230px] sm:w-[260px]"
              />
              <h1 className="text-2xl font-extrabold tracking-tight text-brand-blue sm:text-4xl">
                {t('heroTitle')}
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-700 sm:text-base">
                {t('heroSubtitle')}
              </p>
            </div>

            {/* Download App from Chrome / Browser */}
            <div
              id="download-app"
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <PwaInstallBanner variant="hero" />
              <p className="mt-2 text-xs text-slate-600">
                {t('postLoginNote')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href="#login-portal"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-brand-blue px-5 text-sm font-semibold text-white shadow hover:bg-brand-blue/90"
              >
                <span>{t('heroCtaLogin')}</span>
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#features"
                className="inline-flex h-11 items-center rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                {t('heroCtaFeatures')}
              </a>
            </div>
          </div>

          {/* Right Column: Embedded Admin & Guard Login Portal */}
          <div id="login-portal" className="lg:col-span-5">
            {sessionUser ? (
              <Card className="border-2 border-brand-blue/20 shadow-md">
                <CardHeader className="bg-brand-blue text-white rounded-t-lg">
                  <span className="inline-block w-fit rounded-full bg-amber-400 px-2.5 py-0.5 text-[11px] font-bold text-slate-950">
                    {sessionUser.role.toUpperCase()}
                  </span>
                  <CardTitle className="pt-1 text-lg text-white">
                    {t('loginCardTitle')}
                  </CardTitle>
                  <CardDescription className="text-white/85">
                    {t('loggedInWelcome')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-5">
                  <PwaInstallBanner variant="hero" />

                  <div className="space-y-2.5 pt-2">
                    {isAdmin && (
                      <>
                        <Link
                          href="/dashboard"
                          className="flex h-11 w-full items-center justify-between rounded-md bg-brand-blue px-4 text-sm font-semibold text-white shadow hover:bg-brand-blue/90"
                        >
                          <span>{t('openDashboardBtn')}</span>
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link
                          href="/students"
                          className="flex h-11 w-full items-center justify-between rounded-md border border-brand-blue bg-indigo-50 px-4 text-sm font-semibold text-brand-blue hover:bg-indigo-100"
                        >
                          <span>{t('openStudentsBtn')}</span>
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </>
                    )}
                    <Link
                      href="/gate"
                      className="flex h-11 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                    >
                      <span>{t('openGateBtn')}</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-2 border-brand-blue/20 shadow-md">
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-brand-blue">
                      <Building2 className="h-3.5 w-3.5" />
                      {t('loginCardBadge')}
                    </span>
                  </div>
                  <CardTitle className="text-lg text-slate-900">
                    {t('loginCardTitle')}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-600">
                    {t('loginCardDesc')}
                  </CardDescription>

                  {/* Role Selector Tabs (Admin vs Guard) */}
                  <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1 pt-1.5">
                    <button
                      type="button"
                      onClick={() => setLoginTab('admin')}
                      className={`rounded-md px-2.5 py-2 text-xs font-semibold transition ${
                        loginTab === 'admin'
                          ? 'bg-brand-blue text-white shadow-sm'
                          : 'text-slate-700 hover:bg-white/60'
                      }`}
                    >
                      {t('tabAdmin')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoginTab('guard')}
                      className={`rounded-md px-2.5 py-2 text-xs font-semibold transition ${
                        loginTab === 'guard'
                          ? 'bg-brand-blue text-white shadow-sm'
                          : 'text-slate-700 hover:bg-white/60'
                      }`}
                    >
                      {t('tabGuard')}
                    </button>
                  </div>

                  <p className="rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
                    {loginTab === 'admin' ? t('adminHint') : t('guardHint')}
                  </p>
                </CardHeader>

                <CardContent>
                  <form
                    onSubmit={handleLoginSubmit}
                    className="space-y-3.5"
                    noValidate
                  >
                    <div className="space-y-1">
                      <Label htmlFor="landing-phone">
                        {tLogin('phoneLabel')}
                      </Label>
                      <Input
                        id="landing-phone"
                        name="phone"
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        placeholder={tLogin('phonePlaceholder')}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                        autoComplete="tel"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="landing-password">
                        {tLogin('passwordLabel')}
                      </Label>
                      <Input
                        id="landing-password"
                        name="password"
                        type="password"
                        placeholder={tLogin('passwordPlaceholder')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                      />
                    </div>

                    {errorKey && (
                      <p
                        role="alert"
                        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
                      >
                        {tLogin(errorKey)}
                      </p>
                    )}

                    <Button
                      type="submit"
                      className="h-11 w-full bg-brand-blue font-semibold text-white hover:bg-brand-blue/90"
                      disabled={isPending}
                    >
                      {isPending ? tLogin('submitting') : tLogin('submit')}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </section>

      {/* Complete Feature Showcase */}
      <section id="features" className="py-12 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-brand-blue">
              {t('featuresBadge')}
            </span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {t('featuresTitle')}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {t('featuresSubtitle')}
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feat) => {
              const Icon = feat.icon;
              return (
                <Card
                  key={feat.title}
                  className="flex flex-col justify-between border-slate-200 bg-white transition hover:border-brand-blue/40 hover:shadow-md"
                >
                  <CardHeader className="pb-2">
                    <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-blue text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-base text-slate-900">
                      {feat.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs leading-relaxed text-slate-600">
                      {feat.desc}
                    </p>
                    <div className="pt-1">
                      <span className="inline-block rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-brand-blue">
                        {feat.route}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3-Step Workflow: Login -> Download from Chrome -> Work 100% Standalone */}
      <section
        id="workflow"
        className="border-t border-slate-200 bg-brand-blue py-12 text-white"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-xl font-bold text-white sm:text-2xl">
            {t('workflowTitle')}
          </h2>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-white/20 bg-white/10 p-5">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-slate-950">
                1
              </div>
              <h3 className="mt-3 text-base font-bold text-white">
                {t('step1Title')}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-white/85">
                {t('step1Desc')}
              </p>
            </div>

            <div className="rounded-xl border border-white/20 bg-white/10 p-5">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-slate-950">
                2
              </div>
              <h3 className="mt-3 text-base font-bold text-white">
                {t('step2Title')}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-white/85">
                {t('step2Desc')}
              </p>
            </div>

            <div className="rounded-xl border border-white/20 bg-white/10 p-5">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-slate-950">
                3
              </div>
              <h3 className="mt-3 text-base font-bold text-white">
                {t('step3Title')}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-white/85">
                {t('step3Desc')}
              </p>
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <PwaInstallBanner variant="hero" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-xs text-slate-600">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Image
              src="/brand/icon.png"
              alt="GateSathi"
              width={24}
              height={24}
              className="h-6 w-6"
            />
            <span className="font-bold text-brand-blue">GateSathi</span>
            <span>— {t('footerTagline')}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="font-medium text-brand-blue hover:underline">
              /login
            </Link>
            <Link href="/gate" className="font-medium text-brand-blue hover:underline">
              /gate
            </Link>
            <Link href="/dashboard" className="font-medium text-brand-blue hover:underline">
              /dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
