'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { MoreVertical, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { logoutAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

export function LogoutButton({ label }: { label: string }) {
  const t = useTranslations('app');
  const [isPending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
        setConfirmStep(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleLogout = () => {
    startTransition(async () => {
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const cacheKeys = await window.caches.keys();
          await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
        } catch {
          // Ignore cache deletion failure in unsupported environments
        }
      }
      await logoutAction();
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isPending}
        aria-label={label}
        aria-expanded={menuOpen}
        onClick={() => {
          setMenuOpen((prev) => !prev);
          setConfirmStep(false);
        }}
        className="h-8 w-8 rounded-md p-0 text-white hover:bg-white/15 hover:text-white"
      >
        <MoreVertical className="h-5 w-5" />
      </Button>

      {menuOpen && (
        <div className="absolute right-0 top-10 z-50 w-48 rounded-xl border border-slate-200 bg-white p-2 text-slate-900 shadow-lg">
          {!confirmStep ? (
            <button
              type="button"
              onClick={() => setConfirmStep(true)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </button>
          ) : (
            <div className="space-y-1.5 p-1">
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={handleLogout}
                className="h-8 w-full bg-red-600 text-xs font-semibold text-white hover:bg-red-700"
              >
                {t('logoutConfirm')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  setConfirmStep(false);
                  setMenuOpen(false);
                }}
                className="h-8 w-full text-xs font-medium text-slate-700"
              >
                {t('logoutCancel')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
