'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, Search, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type GatePurpose } from '@/lib/validations';

interface InsideVisitItem {
  visitId: string;
  visitorName: string;
  visitorPhone: string;
  signedPhotoUrl: string | null;
  students: Array<{
    studentId: string;
    name: string;
    admissionNo: string;
    className: string;
    section: string;
  }>;
  purpose: string;
  isApproved: boolean;
  entryAt: string;
}

function formatDuration(entryAtIso: string, nowMs: number): string {
  const diffMin = Math.max(
    0,
    Math.floor((nowMs - new Date(entryAtIso).getTime()) / 60000)
  );
  if (diffMin < 60) {
    return `${diffMin} min`;
  }
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return `${hrs} h ${mins} min`;
}

export function InsideClient({ schoolId }: { schoolId: string }) {
  const t = useTranslations('gate');

  const [visits, setVisits] = useState<InsideVisitItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [confirmingVisitId, setConfirmingVisitId] = useState<string | null>(
    null
  );
  const [markedVisitIds, setMarkedVisitIds] = useState<Record<string, boolean>>(
    {}
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!confirmingVisitId) return;
    const timer = setTimeout(() => {
      setConfirmingVisitId(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [confirmingVisitId]);

  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;

    fetch(`/api/gate/visits/inside?schoolId=${encodeURIComponent(schoolId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setErrorMsg(data.error ?? 'Failed to load inside visitors');
          return;
        }
        setErrorMsg(null);
        setVisits(data.visits ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMsg('Failed to load inside visitors');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [schoolId, refreshKey]);

  const handleExitButtonTap = async (v: InsideVisitItem) => {
    setErrorMsg(null);
    if (confirmingVisitId !== v.visitId) {
      setConfirmingVisitId(v.visitId);
      return;
    }

    setConfirmingVisitId(null);
    const leftWithStudent = v.purpose === 'Pickup' && v.isApproved;
    const res = await fetch(`/api/gate/visits/${v.visitId}/exit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolId,
        leftWithStudent,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data.error ?? 'Failed to mark exit');
      return;
    }

    setMarkedVisitIds((prev) => ({ ...prev, [v.visitId]: true }));
    setTimeout(() => {
      setRefreshKey((k) => k + 1);
    }, 700);
  };

  const filteredVisits = visits.filter((v) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const matchVisitor = v.visitorName.toLowerCase().includes(q);
    const matchStudent = v.students.some((s) =>
      s.name.toLowerCase().includes(q)
    );
    return matchVisitor || matchStudent;
  });

  return (
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col justify-between space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900">
            {t('insideTitle')} · {visits.length}
          </h2>
          <button
            type="button"
            onClick={() => setShowSearch((prev) => !prev)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
          </button>
        </div>

        {showSearch && (
          <Input
            placeholder={t('insideSearchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 rounded-lg border-slate-300 bg-white text-xs"
          />
        )}

        {errorMsg && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {errorMsg}
          </p>
        )}

        {filteredVisits.length === 0 ? (
          <div className="rounded-xl border border-[#E2E8F0] bg-white py-12 text-center text-xs text-slate-500">
            {t('noInsideVisits')}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredVisits.map((v) => {
              const entryMs = new Date(v.entryAt).getTime();
              const isOver2h = nowMs - entryMs > 2 * 60 * 60 * 1000;
              const timeFormatted = new Date(v.entryAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              const durationStr = formatDuration(v.entryAt, nowMs);
              const studentSummary = v.students
                .map((s) => `${s.name} (${s.className}-${s.section})`)
                .join(', ');
              const isConfirming = confirmingVisitId === v.visitId;
              const isMarked = Boolean(markedVisitIds[v.visitId]);

              return (
                <div
                  key={v.visitId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3.5 shadow-2xs"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {v.signedPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.signedPhotoUrl}
                        alt={v.visitorName}
                        className="h-11 w-11 shrink-0 rounded-full border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <UserIcon className="h-5 w-5" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {v.visitorName}
                        </p>
                        {isOver2h && (
                          <span className="rounded-full border border-[#F59E0B] bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            {t('over2hBadge')}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-600">
                        {studentSummary} ·{' '}
                        {t(`purposes.${v.purpose as GatePurpose}`)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {t('timeIn')} {timeFormatted} · {durationStr}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isMarked ? (
                      <span className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-100 px-3 text-xs font-bold text-[#059669]">
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                        {t('exitMarkedToast')}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleExitButtonTap(v)}
                        className={
                          isConfirming
                            ? 'h-9 rounded-lg bg-[#DC2626] px-3 text-xs font-bold text-white hover:bg-red-700'
                            : 'h-9 rounded-lg border border-[#DC2626] bg-white px-3.5 text-xs font-bold text-[#DC2626] hover:bg-red-50'
                        }
                      >
                        {isConfirming ? t('confirmExitBtn') : t('markExitBtn')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-2">
        <Link
          href="/gate"
          className="flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 shadow-2xs hover:bg-slate-50"
        >
          {t('backToGateBtn')}
        </Link>
      </div>
    </div>
  );
}
