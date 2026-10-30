import Link from 'next/link';
import { WifiOff } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { AppHeader } from '@/components/app-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function OfflineFallbackPage() {
  const t = await getTranslations('offline');

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[360px] flex-col bg-slate-50 shadow-sm">
      <AppHeader />
      <main className="flex flex-1 flex-col items-center justify-center p-4">
        <Card className="w-full text-center">
          <CardHeader className="items-center pb-2">
            <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <WifiOff className="h-6 w-6" aria-hidden="true" />
            </div>
            <CardTitle className="text-base text-slate-900">
              No internet. Your entry was not saved. Try again when online.
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-600">{t('messageHi')}</p>
            <Link
              href="/app"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand-blue px-4 text-xs font-semibold text-white hover:bg-brand-blue/90"
            >
              {t('retryBtn')}
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
