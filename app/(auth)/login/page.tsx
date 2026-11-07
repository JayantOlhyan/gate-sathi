import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
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
    redirect('/app');
  }

  const tLogin = await getTranslations('login');

  return (
    <div className="flex flex-1 flex-col bg-[#F8FAFC]">
      <div className="bg-brand-blue px-4 pb-12 pt-4 text-white">
        <div className="flex items-center justify-end">
          <LanguageToggle segmented />
        </div>
        <div className="mt-4 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-2 shadow-sm">
            <Image
              src="/brand/icon.png"
              alt="GateSathi"
              width={44}
              height={44}
              priority
              className="h-10 w-10 object-contain"
            />
          </div>
          <h1 className="mt-3 text-xl font-bold tracking-tight text-white">
            GateSathi
          </h1>
          <p className="mt-1 text-xs font-medium text-white/85">
            {tLogin('subtitle')}
          </p>
        </div>
      </div>

      <main className="-mt-6 flex flex-1 flex-col items-center justify-between px-4 pb-5">
        <div className="w-full">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs font-medium text-slate-400">
          {tLogin('footerBrand')}
        </p>
      </main>
    </div>
  );
}
