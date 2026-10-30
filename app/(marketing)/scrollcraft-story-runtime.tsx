'use client';

import { useEffect } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    ScrollCraft?: {
      mount: (
        root?: Element | Document | string,
        opts?: Record<string, unknown>
      ) => {
        destroy?: () => void;
        layout?: () => void;
        read?: () => void;
      };
    };
  }
}

export function ScrollCraftStoryRuntime() {
  useEffect(() => {
    let instance: {
      destroy?: () => void;
      layout?: () => void;
      read?: () => void;
    } | null = null;
    let rafId = 0;

    const rootEl = document.getElementById('gatesathi-story-root');
    const howAct = document.getElementById('act-how-it-works');
    const passEl = document.querySelector<HTMLElement>('[data-gatesathi-pass]');
    const folioEl = document.querySelector<HTMLElement>('[data-story-folio]');

    const tryMount = () => {
      if (window.ScrollCraft && rootEl && !instance) {
        instance = window.ScrollCraft.mount(rootEl);
      }
    };

    tryMount();

    // Bespoke Signature Move: drive the live bilingual Gate Verification Pass
    // and chapter folio readout from scroll progress (--sc-p) without touching scrollcraft.js
    const syncSignatureMove = () => {
      if (howAct && passEl) {
        const rect = howAct.getBoundingClientRect();
        const span = Math.max(1, rect.height - window.innerHeight);
        const p = Math.max(0, Math.min(1, -rect.top / span));
        const stage = p < 0.34 ? '1' : p < 0.68 ? '2' : '3';
        if (passEl.getAttribute('data-pass-stage') !== stage) {
          passEl.setAttribute('data-pass-stage', stage);
        }
        passEl.style.setProperty('--pass-p', p.toFixed(3));
      }

      if (folioEl) {
        const isHi = document.documentElement.lang === 'hi';
        const scrollRatio =
          window.scrollY /
          Math.max(
            1,
            document.documentElement.scrollHeight - window.innerHeight
          );
        const chapter = isHi
          ? scrollRatio < 0.16
            ? 'I · गेट प्रवेश'
            : scrollRatio < 0.34
              ? 'II · रजिस्टर की समस्या'
              : scrollRatio < 0.62
                ? 'III · 3-स्टेप प्रोसेस'
                : scrollRatio < 0.8
                  ? 'IV · मुख्य फीचर्स'
                  : scrollRatio < 0.92
                    ? 'V · प्राइवेसी और सुरक्षा'
                    : 'VI · पायलट रिक्वेस्ट'
          : scrollRatio < 0.16
            ? 'I · The Gate'
            : scrollRatio < 0.34
              ? 'II · The Blind Spot'
              : scrollRatio < 0.62
                ? 'III · 3-Step Flow'
                : scrollRatio < 0.8
                  ? 'IV · Capabilities'
                  : scrollRatio < 0.92
                    ? 'V · DPDP & Safety'
                    : 'VI · Request Pilot';
        if (folioEl.textContent !== chapter) {
          folioEl.textContent = chapter;
        }
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(syncSignatureMove);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    syncSignatureMove();

    const intervalId = window.setInterval(() => {
      if (!instance && window.ScrollCraft) {
        tryMount();
        syncSignatureMove();
      }
    }, 150);

    return () => {
      window.clearInterval(intervalId);
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (instance?.destroy) {
        instance.destroy();
      }
    };
  }, []);

  return (
    <Script
      src="/scrollcraft/scrollcraft.js"
      strategy="afterInteractive"
      onLoad={() => {
        const rootEl = document.getElementById('gatesathi-story-root');
        if (window.ScrollCraft && rootEl) {
          window.ScrollCraft.mount(rootEl);
        }
      }}
    />
  );
}
