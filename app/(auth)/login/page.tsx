import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { getDefaultRouteForRole } from '@/lib/auth-service';
import { LanguageToggle } from '@/components/language-toggle';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  let session = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  if (session?.user?.id && session.user.role) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const tLogin = await getTranslations('login');

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-end px-4 pt-3">
        <LanguageToggle />
      </div>
      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-6 pt-2">
        <div className="mb-5 flex flex-col items-center text-center">
          <Image
            src="/brand/logo-horizontal.png"
            alt="GateSathi"
            width={220}
            height={73}
            priority
            className="h-auto w-[220px] max-w-[220px]"
          />
          <p className="mt-2 text-sm font-semibold text-brand-blue">
            {tLogin('tagline')}
          </p>
          <p className="mt-0.5 text-xs font-medium text-slate-600">
            {tLogin('subtitle')}
          </p>
        </div>
        <LoginForm />
      </main>
    </div>
  );
}
