'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Bell,
  Check,
  Clock,
  User as UserIcon,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SessionUser } from '@/lib/rbac';

interface ApprovalRequestItem {
  _id: string;
  schoolId: string;
  visitId: string;
  studentId: string;
  visitorId: string;
  teacherId: string | null;
  teacherName: string | null;
  status: 'pending' | 'escalated' | 'approved' | 'rejected' | 'expired';
  requestedBy: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt?: string;
  escalatedAt?: string;
  note: string | null;
  createdAt: string;
  student?: {
    _id: string;
    name: string;
    className: string;
    section: string;
    rollNumber?: string;
  };
  visitor?: {
    _id: string;
    name: string;
    phone: string;
    defaultRelation?: string;
    signedPhotoUrl?: string | null;
  };
  visit?: {
    _id: string;
    purpose: string;
    purposeNote?: string;
    reasonCode?: string;
    reasonText?: string;
    entryAt: string;
    photoMissing?: boolean;
  };
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function TeacherClient({
  user,
  schoolId,
}: {
  user: SessionUser;
  schoolId: string;
}) {
  const t = useTranslations('teacher');
  const searchParams = useSearchParams();
  const router = useRouter();
  const focusedRequestId = searchParams.get('request');

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [pendingRequests, setPendingRequests] = useState<ApprovalRequestItem[]>(
    []
  );
  const [historyRequests, setHistoryRequests] = useState<ApprovalRequestItem[]>(
    []
  );
  const [escalationMinutes, setEscalationMinutes] = useState<number>(5);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Reject inline note state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Add as guardian toggle state per request (unchecked by default)
  const [guardianCheck, setGuardianCheck] = useState<Record<string, boolean>>(
    {}
  );

  // Push notification state
  const [pushStatus, setPushStatus] = useState<
    'default' | 'granted' | 'denied' | 'unsupported' | 'subscribed'
  >(() => {
    if (typeof window === 'undefined') return 'default';
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      return 'unsupported';
    }
    if (Notification.permission === 'granted') {
      return 'subscribed';
    }
    if (Notification.permission === 'denied') {
      return 'denied';
    }
    return 'default';
  });
  const [pushLoading, setPushLoading] = useState(false);
  const [isIOS] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  });
  const [isStandalone] = useState(() => {
    if (typeof window === 'undefined') return true;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSubscribePush = async () => {
    if (pushStatus === 'unsupported') return;
    setPushLoading(true);
    setErrorMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('denied');
        setPushLoading(false);
        return;
      }
      setPushStatus('granted');

      const keyRes = await fetch('/api/push/vapid-public-key');
      const { publicKey } = await keyRes.json();
      if (!publicKey) {
        throw new Error('VAPID public key not configured');
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const rawSub = sub.toJSON();
      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId,
          endpoint: sub.endpoint,
          keys: {
            p256dh: rawSub.keys?.p256dh || '',
            auth: rawSub.keys?.auth || '',
          },
        }),
      });

      setPushStatus('subscribed');
      setSuccessMsg(t('notificationsSubscribedToast'));
    } catch (err: any) {
      setErrorMsg(err.message || 'Error enabling notifications');
    } finally {
      setPushLoading(false);
    }
  };

  const fetchRequests = useCallback(async () => {
    if (!schoolId) return;
    try {
      const [pendingRes, historyRes] = await Promise.all([
        fetch(`/api/schools/${schoolId}/approvals`),
        activeTab === 'history'
          ? fetch(`/api/schools/${schoolId}/approvals?history=true`)
          : Promise.resolve(null),
      ]);
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPendingRequests(data.requests || []);
        if (typeof data.escalationMinutes === 'number') {
          setEscalationMinutes(data.escalationMinutes);
        }
      }
      if (historyRes && historyRes.ok) {
        const hData = await historyRes.json();
        setHistoryRequests(hData.requests || []);
      }
    } catch {
      // ignore poll network glitch
    } finally {
      setLoading(false);
    }
  }, [schoolId, activeTab]);

  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    const run = async () => {
      try {
        const [pendingRes, historyRes] = await Promise.all([
          fetch(`/api/schools/${schoolId}/approvals`),
          activeTab === 'history'
            ? fetch(`/api/schools/${schoolId}/approvals?history=true`)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (pendingRes.ok) {
          const data = await pendingRes.json();
          if (!cancelled) {
            setPendingRequests(data.requests || []);
            if (typeof data.escalationMinutes === 'number') {
              setEscalationMinutes(data.escalationMinutes);
            }
          }
        }
        if (historyRes && historyRes.ok) {
          const hData = await historyRes.json();
          if (!cancelled) {
            setHistoryRequests(hData.requests || []);
          }
        }
      } catch {
        // ignore poll network glitch
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    const interval = setInterval(() => {
      void run();
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [schoolId, activeTab]);

  const handleDecision = async (
    requestId: string,
    decision: 'approve' | 'reject'
  ) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (decision === 'reject') {
      if (!rejectNote.trim() || rejectNote.trim().length < 3) {
        setErrorMsg(t('rejectReasonRequired'));
        return;
      }
    }

    setProcessingId(requestId);
    try {
      const res = await fetch(
        `/api/schools/${schoolId}/approvals/${requestId}/decide`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision,
            note: decision === 'reject' ? rejectNote.trim() : undefined,
            addAsApprovedGuardian: Boolean(guardianCheck[requestId]),
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Error saving decision');
        return;
      }

      setSuccessMsg(
        decision === 'approve' ? t('approvedSuccess') : t('rejectedSuccess')
      );
      setRejectingId(null);
      setRejectNote('');
      if (focusedRequestId) {
        router.replace('/teacher');
      }
      await fetchRequests();
    } catch {
      setErrorMsg('Network error saving decision');
    } finally {
      setProcessingId(null);
    }
  };

  const formatWaitingTime = (createdAt: string) => {
    const diffMs = Math.max(0, nowMs - new Date(createdAt).getTime());
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return t('justNow');
    return t('minsAgo', { count: mins });
  };

  // Ref 08: Full-bleed navy "buzzer" request detail view when ?request=<id> matches a pending request
  const focusedRequest = focusedRequestId
    ? pendingRequests.find((r) => r._id === focusedRequestId) ??
      pendingRequests[0]
    : null;

  if (focusedRequestId && focusedRequest) {
    const req = focusedRequest;
    const isProcessing = processingId === req._id;
    const isRejecting = rejectingId === req._id;
    const createdMs = new Date(req.createdAt).getTime();
    const elapsedSec = Math.max(0, Math.floor((nowMs - createdMs) / 1000));
    const totalEscSec = Math.max(60, escalationMinutes * 60);
    const remSec = Math.max(0, totalEscSec - elapsedSec);
    const remTimeStr = `${Math.floor(remSec / 60)}:${String(remSec % 60).padStart(2, '0')}`;
    const reqTimeStr = new Date(req.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <div className="-m-3.5 flex min-h-[calc(100dvh-3.5rem)] flex-col justify-between bg-brand-blue px-4 py-4 text-white">
        <div>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/15 ring-4 ring-white/10">
            <Bell className="h-6 w-6 text-[#F59E0B]" />
          </div>
          <p className="mt-2 text-center text-sm font-bold text-white">
            {t('buzzerTitle')} · {reqTimeStr}
          </p>

          {/* White Visitor & Student Card */}
          <div className="mt-3 rounded-2xl bg-white p-4 text-center text-slate-900 shadow-lg">
            <div className="mx-auto h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              {req.visitor?.signedPhotoUrl && !req.visit?.photoMissing ? (
                <Image
                  src={req.visitor.signedPhotoUrl}
                  alt={req.visitor.name || 'Visitor'}
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center p-1 text-center text-slate-400">
                  <UserIcon className="h-7 w-7" />
                  <span className="mt-0.5 text-[9px] font-semibold leading-tight text-slate-500">
                    {t('photoUnavailable')}
                  </span>
                </div>
              )}
            </div>

            <h2 className="mt-2.5 text-lg font-extrabold text-slate-900">
              {req.visitor?.name}
            </h2>
            <p className="text-xs font-medium text-slate-600">
              {t('saysRelation', {
                relation:
                  req.visit?.reasonCode ||
                  req.visitor?.defaultRelation ||
                  'Visitor',
              })}{' '}
              · {req.visitor?.phone}
            </p>

            <div className="my-3 border-t border-slate-200 pt-2.5">
              <p className="text-[11px] font-medium text-slate-500">
                {t('wantsToTake')}
              </p>
              <p className="mt-0.5 text-base font-extrabold text-slate-900">
                {req.student?.name} · Class {req.student?.className}-
                {req.student?.section}
              </p>
            </div>

            <div className="rounded-lg border border-[#F59E0B] bg-[#FFFBEB] px-3 py-1.5 text-[11px] font-bold text-amber-900">
              ⚠{' '}
              {t('notOnGuardianListReason', {
                reason:
                  req.visit?.reasonCode ||
                  req.visitor?.defaultRelation ||
                  'Unlisted',
              })}
            </div>

            <label
              htmlFor={`buzzer-guardian-${req._id}`}
              className="mt-3 flex cursor-pointer items-center justify-center gap-2 text-xs font-medium text-slate-700"
            >
              <input
                type="checkbox"
                id={`buzzer-guardian-${req._id}`}
                checked={Boolean(guardianCheck[req._id])}
                onChange={(e) =>
                  setGuardianCheck((prev) => ({
                    ...prev,
                    [req._id]: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-brand-blue"
              />
              <span>{t('addGuardianCheckbox')}</span>
            </label>
          </div>

          {errorMsg && (
            <p
              role="alert"
              className="mt-2.5 rounded-lg bg-red-600/90 px-3 py-2 text-center text-xs font-bold text-white"
            >
              {errorMsg}
            </p>
          )}
        </div>

        <div className="mt-4 space-y-2.5">
          {isRejecting ? (
            <div className="rounded-xl bg-white p-3 text-slate-900 shadow-md space-y-2">
              <Label
                htmlFor="buzzer-reject-note"
                className="text-xs font-bold text-red-900"
              >
                {t('rejectNoteLabel')}
              </Label>
              <Input
                id="buzzer-reject-note"
                placeholder={t('rejectNotePlaceholder')}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="h-10 text-xs"
                autoFocus
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRejectingId(null);
                    setRejectNote('');
                  }}
                  className="h-9 text-xs font-semibold"
                >
                  {t('cancelBtn')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => void handleDecision(req._id, 'reject')}
                  className="h-9 bg-[#DC2626] text-xs font-bold text-white hover:bg-red-700"
                >
                  {t('confirmRejectBtn')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setRejectingId(req._id);
                  setRejectNote('');
                }}
                className="h-14 rounded-xl bg-[#DC2626] text-base font-extrabold text-white shadow-md hover:bg-red-700"
              >
                ✕ {t('rejectBtn')}
              </Button>
              <Button
                type="button"
                disabled={isProcessing}
                onClick={() => void handleDecision(req._id, 'approve')}
                className="h-14 rounded-xl bg-[#059669] text-base font-extrabold text-white shadow-md hover:bg-[#047857]"
              >
                ✓ {t('approveBtn')}
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-white/80">
            <span>{t('goesToPrincipalIfNoAnswer', { time: remTimeStr })}</span>
            <button
              type="button"
              onClick={() => router.replace('/teacher')}
              className="font-semibold text-white underline"
            >
              List view
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Ref 10: Teacher Portal Home
  const assignedClassesText =
    user.classAssignments && user.classAssignments.length > 0
      ? user.classAssignments
          .map((a) => `Class ${a.className}-${a.section}`)
          .join(', ')
      : t('allClassesLabel');

  return (
    <div className="space-y-3.5">
      {/* Top Sub-bar: Assigned classes + Notification status pill */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 shadow-2xs">
        <span className="truncate text-xs font-bold text-slate-800">
          {assignedClassesText}
        </span>
        {pushStatus === 'subscribed' ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-[#059669]">
            {t('notificationsOnPill')}
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={pushLoading || pushStatus === 'unsupported'}
            onClick={handleSubscribePush}
            className="h-7 shrink-0 rounded-full bg-brand-blue px-3 text-[11px] font-bold text-white hover:bg-brand-blue/90"
          >
            🔔 {t('enableNotificationsBtn')}
          </Button>
        )}
      </div>

      {/* iOS PWA Installation Banner */}
      {isIOS && !isStandalone && (
        <div className="rounded-xl border border-[#F59E0B] bg-[#FFFBEB] p-3 text-xs text-amber-950">
          <p className="font-bold">📱 {t('iosInstallTitle')}</p>
          <p className="mt-1 text-[11px] text-amber-800 leading-relaxed">
            {t('iosInstallStep1')} &rarr; {t('iosInstallStep2')} &rarr;{' '}
            {t('iosInstallStep3')}
          </p>
        </div>
      )}

      {/* Enable Notifications Card when not subscribed */}
      {pushStatus !== 'subscribed' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-bold text-blue-950">
                🔔 {t('enableNotificationsTitle')}
              </p>
              <p className="mt-0.5 text-[11px] text-blue-700">
                {t('enableNotificationsDesc')}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={pushLoading || pushStatus === 'unsupported'}
              onClick={handleSubscribePush}
              className="h-8 shrink-0 bg-brand-blue text-xs font-bold text-white hover:bg-brand-blue/90"
            >
              {pushLoading
                ? t('enablingNotifications')
                : t('enableNotificationsBtn')}
            </Button>
          </div>
        </div>
      )}

      {errorMsg && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-red-700"
        >
          {errorMsg}
        </p>
      )}
      {successMsg && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-medium text-emerald-800"
        >
          {successMsg}
        </p>
      )}

      {/* Segmented Tabs (Ref 10) */}
      <div className="grid grid-cols-2 rounded-xl border border-[#E2E8F0] bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => {
            setActiveTab('pending');
            setLoading(true);
          }}
          className={`rounded-lg py-2 text-xs font-bold transition-colors ${
            activeTab === 'pending'
              ? 'bg-brand-blue text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t('pendingTab')} ({pendingRequests.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('history');
            setLoading(true);
          }}
          className={`rounded-lg py-2 text-xs font-bold transition-colors ${
            activeTab === 'history'
              ? 'bg-brand-blue text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t('historyTab')}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-500">
          {t('loadingText')}
        </div>
      ) : activeTab === 'pending' ? (
        pendingRequests.length === 0 ? (
          <div className="rounded-xl border border-[#E2E8F0] bg-white py-12 text-center shadow-2xs">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-[#059669]">
              <Check className="h-6 w-6 stroke-[2.5]" />
            </div>
            <h3 className="mt-2.5 text-sm font-bold text-slate-800">
              {t('noPendingTitle')}
            </h3>
            <p className="mt-1 px-6 text-xs text-slate-500">
              {t('noPendingDesc')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((req) => {
              const isEscalated = req.status === 'escalated';
              const isProcessing = processingId === req._id;
              const isRejecting = rejectingId === req._id;

              return (
                <div
                  key={req._id}
                  className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-3.5 shadow-xs space-y-3"
                >
                  {/* Top Badge + Elapsed */}
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFBEB] px-2.5 py-0.5 text-[11px] font-bold text-amber-900 border border-[#F59E0B]/40">
                      {isEscalated
                        ? t('escalatedBadge')
                        : req.visit?.purpose || t('defaultPickupPurpose')}
                    </span>
                    <button
                      type="button"
                      onClick={() => router.push(`/teacher?request=${req._id}`)}
                      className="text-[11px] font-semibold text-slate-500 hover:text-brand-blue"
                    >
                      {formatWaitingTime(req.createdAt)}
                    </button>
                  </div>

                  {/* Visitor & Child Row */}
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => router.push(`/teacher?request=${req._id}`)}
                      className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                    >
                      {req.visitor?.signedPhotoUrl && !req.visit?.photoMissing ? (
                        <Image
                          src={req.visitor.signedPhotoUrl}
                          alt={req.visitor.name || 'Visitor'}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center p-0.5 text-center text-slate-400">
                          <UserIcon className="h-5 w-5" />
                          <span className="text-[8px] font-semibold leading-tight text-slate-500">
                            {t('photoUnavailable')}
                          </span>
                        </div>
                      )}
                    </button>

                    <div className="min-w-0 flex-1 text-xs space-y-1">
                      <p className="text-slate-600">
                        <span className="text-slate-500">
                          {t('visitorLabel')}:
                        </span>{' '}
                        <strong className="text-slate-900">
                          {req.visitor?.name}
                        </strong>{' '}
                        ({req.visitor?.defaultRelation || 'Relative'} ·{' '}
                        {req.visitor?.phone})
                      </p>
                      <p className="text-slate-600">
                        <span className="text-slate-500">
                          {t('studentLabel')}:
                        </span>{' '}
                        <strong className="text-brand-blue">
                          {req.student?.name} (Class {req.student?.className}-
                          {req.student?.section})
                        </strong>
                      </p>
                      {(req.visit?.reasonCode || req.visit?.reasonText) && (
                        <p className="text-slate-600">
                          <span className="text-slate-500">
                            {t('guardReasonLabel')}:
                          </span>{' '}
                          <span className="font-medium text-slate-800">
                            {req.visit?.reasonCode}
                            {req.visit?.reasonText
                              ? ` (${req.visit.reasonText})`
                              : ''}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Add as approved guardian checkbox */}
                  <label
                    htmlFor={`guardian-${req._id}`}
                    className="flex cursor-pointer items-center gap-2 text-xs text-slate-700"
                  >
                    <input
                      type="checkbox"
                      id={`guardian-${req._id}`}
                      checked={Boolean(guardianCheck[req._id])}
                      onChange={(e) =>
                        setGuardianCheck((prev) => ({
                          ...prev,
                          [req._id]: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-brand-blue"
                    />
                    <span>{t('addGuardianCheckbox')}</span>
                  </label>

                  {/* Inline Reject Form or Approve / Reject Buttons */}
                  {isRejecting ? (
                    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
                      <Label
                        htmlFor={`note-${req._id}`}
                        className="text-xs font-bold text-red-900"
                      >
                        {t('rejectNoteLabel')}
                      </Label>
                      <Input
                        id={`note-${req._id}`}
                        placeholder={t('rejectNotePlaceholder')}
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        className="h-9 bg-white text-xs"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRejectingId(null);
                            setRejectNote('');
                          }}
                          className="h-8 text-xs"
                        >
                          {t('cancelBtn')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={isProcessing}
                          onClick={() => void handleDecision(req._id, 'reject')}
                          className="h-8 bg-[#DC2626] text-xs font-bold text-white hover:bg-red-700"
                        >
                          {isProcessing
                            ? t('savingDecision')
                            : t('confirmRejectBtn')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                      <Button
                        type="button"
                        size="sm"
                        disabled={isProcessing}
                        onClick={() => void handleDecision(req._id, 'approve')}
                        className="h-10 rounded-lg bg-[#059669] text-xs font-bold text-white hover:bg-[#047857]"
                      >
                        {isProcessing
                          ? t('verifyingDecision')
                          : `✓ ${t('approveBtn')}`}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isProcessing}
                        onClick={() => {
                          setRejectingId(req._id);
                          setRejectNote('');
                        }}
                        className="h-10 rounded-lg border-[#DC2626] text-xs font-bold text-[#DC2626] hover:bg-red-50"
                      >
                        ✕ {t('rejectBtn')}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            <p className="pt-2 text-center text-xs text-slate-400">
              {t('noOtherRequests')}
            </p>
          </div>
        )
      ) : (
        /* History Tab (30 days) */
        <div className="space-y-2.5">
          {historyRequests.length === 0 ? (
            <div className="rounded-xl border border-[#E2E8F0] bg-white py-12 text-center text-xs text-slate-500">
              {t('noHistoryDesc')}
            </div>
          ) : (
            historyRequests.map((req) => (
              <div
                key={req._id}
                className="rounded-xl border border-[#E2E8F0] bg-white p-3.5 text-xs shadow-2xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      req.status === 'approved'
                        ? 'bg-emerald-100 text-[#059669]'
                        : req.status === 'rejected'
                        ? 'bg-red-100 text-[#DC2626]'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {req.status === 'approved'
                      ? `✓ ${t('statusApproved')}`
                      : req.status === 'rejected'
                      ? `✕ ${t('statusRejected')}`
                      : t('statusExpired')}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {req.decidedAt
                      ? new Date(req.decidedAt).toLocaleString([], {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </span>
                </div>
                <p className="text-slate-800">
                  <strong>{req.visitor?.name}</strong> &rarr;{' '}
                  {req.student?.name} (Class {req.student?.className}-
                  {req.student?.section})
                </p>
                {req.note && (
                  <p className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                    {t('notePrefix')}: {req.note}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
