import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LanguageToggle } from '@/components/language-toggle';
import { LogoutButton } from '@/components/logout-button';

export async function AppHeader({
  showLogout = false,
  subtitle,
}: {
  showLogout?: boolean;
  subtitle?: string;
}) {
  const t = await getTranslations('app');

  return (
    <header className="flex min-h-14 items-center justify-between bg-brand-blue px-3.5 py-2 text-white shadow-xs">
      <div className="flex min-w-0 flex-col">
        <Link href="/app" className="flex items-center gap-2">
          <Image
            src="/brand/icon-white.png"
            alt="GateSathi"
            width={32}
            height={32}
            className="h-7 w-7 shrink-0"
          />
          <span className="text-base font-bold leading-none tracking-tight text-white">
            GateSathi
          </span>
        </Link>
        {subtitle && (
          <p className="mt-0.5 truncate text-[11px] font-medium text-white/80">
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <LanguageToggle onBrandBlue />
        {showLogout && <LogoutButton label={t('logout')} />}
      </div>
    </header>
  );
}
