import { getTranslations } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';
import { LanguageToggle } from '@/components/language-toggle';
import { logoutAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

export async function AppHeader({ showLogout = false }: { showLogout?: boolean }) {
  const t = await getTranslations('app');

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-slate-900" aria-hidden="true" />
        <div>
          <h1 className="text-base font-bold leading-tight text-slate-900">
            {t('title')}
          </h1>
          <p className="text-[11px] text-slate-600">{t('subtitle')}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <LanguageToggle />
        {showLogout && (
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              {t('logout')}
            </Button>
          </form>
        )}
      </div>
    </header>
  );
}
