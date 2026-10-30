import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LanguageToggle } from '@/components/language-toggle';
import { logoutAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

export async function AppHeader({
  showLogout = false,
}: {
  showLogout?: boolean;
}) {
  const t = await getTranslations('app');

  return (
    <header className="flex h-14 max-h-14 items-center justify-between bg-brand-blue px-3 text-white shadow-sm">
      <Link href="/app" className="flex items-center gap-2">
        <Image
          src="/brand/icon-white.png"
          alt="GateSathi"
          width={32}
          height={32}
          className="h-8 w-8 shrink-0"
        />
        <span className="text-base font-bold leading-none tracking-tight text-white">
          GateSathi
        </span>
      </Link>
      <div className="flex items-center gap-1.5">
        <LanguageToggle onBrandBlue />
        {showLogout && (
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="h-8 border border-white/40 bg-transparent px-2.5 text-xs font-medium text-white hover:bg-white/15 hover:text-white"
            >
              {t('logout')}
            </Button>
          </form>
        )}
      </div>
    </header>
  );
}
