'use client';

import { useEffect, useState } from 'react';
import { Download, CheckCircle2, Smartphone, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PwaInstallBanner({
  variant = 'compact',
}: {
  variant?: 'compact' | 'hero';
}) {
  const t = useTranslations('pwa');
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as { standalone?: boolean }).standalone)
    );
  });
  const [showInstructions, setShowInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
      setShowInstructions(false);
    };

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    mediaQuery.addEventListener('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
      return;
    }
    setShowInstructions((prev) => !prev);
  };

  if (variant === 'hero') {
    return (
      <div className="space-y-2">
        {isStandalone ? (
          <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{t('installedBadge')}</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleInstallClick}
              className="h-11 gap-2 bg-amber-500 px-5 font-semibold text-slate-950 shadow-sm hover:bg-amber-400"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>{t('downloadBtn')}</span>
            </Button>
          </div>
        )}

        {showInstructions && !isStandalone && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-slate-800 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-slate-900">
                {t('manualInstallTitle')}
              </p>
              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                className="text-slate-500 hover:text-slate-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="mt-1.5 list-inside list-disc space-y-1 text-slate-700">
              <li>{t('chromeInstruction')}</li>
              <li>{t('iosInstruction')}</li>
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (isStandalone || dismissed) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-slate-900">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 shrink-0 text-brand-blue" />
          <span className="font-medium leading-tight">{t('bannerText')}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={handleInstallClick}
            className="h-7 gap-1 bg-brand-blue px-2.5 text-xs font-semibold text-white hover:bg-brand-blue/90"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t('installNowBtn')}</span>
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded p-1 text-slate-500 hover:bg-amber-100 hover:text-slate-800"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showInstructions && (
        <div className="mt-2 rounded border border-amber-300 bg-white p-2.5 text-[11px] text-slate-700">
          <p className="font-semibold text-slate-900">
            {t('manualInstallTitle')}
          </p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>{t('chromeInstruction')}</li>
            <li>{t('iosInstruction')}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
