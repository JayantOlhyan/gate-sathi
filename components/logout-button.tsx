'use client';

import { useTransition } from 'react';
import { logoutAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

export function LogoutButton({ label }: { label: string }) {
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      // Clear all Cache Storage before redirecting on logout
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
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={handleLogout}
      className="h-8 border border-white/40 bg-transparent px-2.5 text-xs font-medium text-white hover:bg-white/15 hover:text-white"
    >
      {label}
    </Button>
  );
}
