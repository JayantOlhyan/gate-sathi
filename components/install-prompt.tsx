'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_STORAGE_KEY = 'gatesathi_install_dismissed_v1';

export function InstallPrompt({
  variant = 'prominent',
}: {
  variant?: 'prominent' | 'compact';
}) {
  const t = useTranslations('installPrompt');
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as { standalone?: boolean }).standalone)
    );
  });

  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(DISMISS_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [isIosSafari] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent || '';
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isWebkit = /WebKit/.test(ua);
    const isCriOS = /CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
    return isIos && isWebkit && !isCriOS;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(() => undefined);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
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

  if (isStandalone || isDismissed) {
    return null;
  }

  // Only show if either beforeinstallprompt fired OR user is on iOS Safari
  // (or on prominent guard screen so guards always see the install card)
  if (!deferredPrompt && !isIosSafari && variant !== 'prominent') {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  if (variant === 'compact') {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-900">{t('title')}</p>
            <p className="text-[11px] text-slate-600">{t('adminDesc')}</p>
            {isIosSafari || !deferredPrompt ? (
              <p className="flex items-center gap-1.5 pt-1 text-[11px] font-medium text-brand-blue">
                <Share className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{t('iosInstruction')}</span>
              </p>
            ) : (
              <div className="pt-1.5">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleInstall}
                  className="h-8 gap-1.5 bg-brand-blue px-3 text-xs font-semibold text-white hover:bg-brand-blue/90"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t('installBtn')}</span>
                </Button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={t('dismissBtn')}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg border-2 border-brand-blue bg-indigo-50 p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-bold text-brand-blue">{t('title')}</p>
          <p className="text-xs text-slate-700">{t('guardDesc')}</p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t('dismissBtn')}
          className="rounded p-1 text-slate-500 hover:bg-indigo-100 hover:text-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isIosSafari || !deferredPrompt ? (
        <div className="mt-2.5 flex items-center gap-2 rounded-md border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-brand-blue">
          <Share className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t('iosInstruction')}</span>
        </div>
      ) : (
        <Button
          type="button"
          onClick={handleInstall}
          className="mt-3 h-10 w-full gap-2 bg-brand-blue text-xs font-semibold text-white hover:bg-brand-blue/90"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>{t('installBtn')}</span>
        </Button>
      )}
    </div>
  );
}
