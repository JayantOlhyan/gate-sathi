'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { loginAction } from '@/app/actions/auth';
import { loginSchema } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
  const t = useTranslations('login');
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorKey, setErrorKey] = useState<
    'validationError' | 'invalidCredentials' | 'lockedAccount' | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
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
      router.push(result.redirectTo ?? '/app');
      router.refresh();
    });
  };

  return (
    <div className="w-full rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
      <h2 className="mb-4 text-lg font-bold text-slate-900">{t('heading')}</h2>
      <form
        method="post"
        onSubmit={handleSubmit}
        className="space-y-4"
        noValidate
      >
        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-xs font-semibold text-slate-700">
            {t('phoneLabel')}
          </Label>
          <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-brand-blue focus-within:ring-2 focus-within:ring-brand-blue/20">
            <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
              +91
            </span>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder={t('phonePlaceholder')}
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
              }
              required
              autoComplete="tel"
              className="h-11 border-0 bg-transparent text-base font-medium shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
            {t('passwordLabel')}
          </Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="h-11 rounded-lg border-slate-300 pr-10 text-base"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:text-slate-800"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {errorKey && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
          >
            {t(errorKey)}
          </p>
        )}

        <Button
          type="submit"
          className="h-12 w-full rounded-lg bg-brand-blue text-sm font-semibold text-white hover:bg-brand-blue/90"
          disabled={isPending}
        >
          {isPending ? t('submitting') : t('submit')}
        </Button>

        <p className="pt-1 text-center text-xs text-slate-500">
          {t('forgotPasswordHint')}
        </p>
      </form>
    </div>
  );
}
