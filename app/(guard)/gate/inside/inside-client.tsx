'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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

export function InsideClient({ schoolId }: { schoolId: string }) {
  const t = useTranslations('gate');

  const [visits, setVisits] = useState<InsideVisitItem[]>([]);
  const [leftWithStudentMap, setLeftWithStudentMap] = useState<
    Record<string, boolean>
  >({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const handleMarkExit = async (visitId: string) => {
    setErrorMsg(null);
    const leftWithStudent = Boolean(leftWithStudentMap[visitId]);
    const res = await fetch(`/api/gate/visits/${visitId}/exit`, {
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
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">
          {t('insideTitle')} ({visits.length})
        </h2>
        <Link
          href="/gate"
          className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 shadow-sm"
        >
          {t('backToEntry')}
        </Link>
      </div>

      {errorMsg && (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {errorMsg}
        </p>
      )}

      {visits.length === 0 ? (
        <p className="py-10 text-center text-xs text-slate-500">
          {t('noInsideVisits')}
        </p>
      ) : (
        <div className="space-y-3">
          {visits.map((v) => {
            const timeFormatted = new Date(v.entryAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <Card key={v.visitId}>
                <CardContent className="space-y-3 p-3.5 text-xs">
                  <div className="flex items-start gap-3">
                    {v.signedPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.signedPhotoUrl}
                        alt={v.visitorName}
                        className="h-14 w-14 rounded-lg border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-500">
                        Photo
                      </div>
                    )}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-slate-900">
                          {v.visitorName}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            v.isApproved
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {v.isApproved ? 'Approved' : 'Unapproved'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {t('timeIn')}: {timeFormatted} · {v.purpose}
                      </p>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {v.students.map((s) => (
                          <span
                            key={s.studentId}
                            className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-800"
                          >
                            {s.name} ({s.className}-{s.section})
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                    <label className="flex items-center gap-1.5 text-xs text-slate-800">
                      <input
                        type="checkbox"
                        checked={Boolean(leftWithStudentMap[v.visitId])}
                        onChange={(e) =>
                          setLeftWithStudentMap((prev) => ({
                            ...prev,
                            [v.visitId]: e.target.checked,
                          }))
                        }
                        className="h-4 w-4"
                      />
                      {t('leftWithStudent')}
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleMarkExit(v.visitId)}
                    >
                      {t('markExitBtn')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
