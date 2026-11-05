'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

function formatWaitingTime(createdAt: string) {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diffMs / (60 * 1000));
  if (mins < 1) return 'अभी-अभी (Just now)';
  if (mins === 1) return '1 मिनट पहले (1 min ago)';
  return `${mins} मिनट पहले (${mins} mins ago)`;
}

export function TeacherClient({
  user,
  schoolId,
}: {
  user: SessionUser;
  schoolId: string;
}) {
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [pendingRequests, setPendingRequests] = useState<ApprovalRequestItem[]>([]);
  const [historyRequests, setHistoryRequests] = useState<ApprovalRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Reject modal / inline note state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Add as guardian toggle state per request
  const [guardianCheck, setGuardianCheck] = useState<Record<string, boolean>>({});

  // Push notification state
  const [pushStatus, setPushStatus] = useState<
    'default' | 'granted' | 'denied' | 'unsupported' | 'subscribed'
  >(() => {
    if (typeof window === 'undefined') return 'default';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return 'unsupported';
    }
    if (Notification.permission === 'granted') {
      return 'granted';
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
      setSuccessMsg('सूचनाएं (Notifications) सफलतापूर्वक चालू हो गईं!');
    } catch (err: any) {
      setErrorMsg(err.message || 'सूचनाएं सक्रिय करने में त्रुटि हुई');
    } finally {
      setPushLoading(false);
    }
  };

  const fetchRequests = useCallback(async () => {
    if (!schoolId) return;
    try {
      if (activeTab === 'pending') {
        const res = await fetch(`/api/schools/${schoolId}/approvals`);
        if (res.ok) {
          const data = await res.json();
          setPendingRequests(data.requests || []);
        }
      } else {
        const res = await fetch(`/api/schools/${schoolId}/approvals?history=true`);
        if (res.ok) {
          const data = await res.json();
          setHistoryRequests(data.requests || []);
        }
      }
    } catch {
      // ignore poll network glitch
    } finally {
      setLoading(false);
    }
  }, [schoolId, activeTab]);

  // Initial and 10s polling effect
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;

    const run = async () => {
      try {
        const endpoint =
          activeTab === 'pending'
            ? `/api/schools/${schoolId}/approvals`
            : `/api/schools/${schoolId}/approvals?history=true`;
        const res = await fetch(endpoint);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (activeTab === 'pending') {
            setPendingRequests(data.requests || []);
          } else {
            setHistoryRequests(data.requests || []);
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    const interval = setInterval(run, 10000);
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
        setErrorMsg('अस्वीकार करने के लिए कारण (टिप्पणी) लिखना अनिवार्य है।');
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
        setErrorMsg(data.error || 'निर्णय सहेजने में त्रुटि हुई');
        return;
      }

      setSuccessMsg(
        decision === 'approve'
          ? 'अनुरोध सफलतापूर्वक स्वीकृत (Approved) किया गया।'
          : 'अनुरोध अस्वीकार (Rejected) कर दिया गया।'
      );
      setRejectingId(null);
      setRejectNote('');
      // Refresh list immediately
      await fetchRequests();
    } catch {
      setErrorMsg('नेटवर्क त्रुटि: निर्णय दर्ज नहीं हो सका');
    } finally {
      setProcessingId(null);
    }
  };

  const assignedClassesText =
    user.classAssignments && user.classAssignments.length > 0
      ? user.classAssignments
          .map((a) => `कक्षा ${a.className}-${a.section}`)
          .join(', ')
      : 'सभी कक्षाएं (Admin view)';

  return (
    <div className="space-y-4">
      {/* Teacher Role Header */}
      <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm border border-slate-200">
        <div>
          <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-brand-blue">
            शिक्षक पोर्टल (Teacher Portal)
          </span>
          <p className="mt-1 text-xs text-slate-600">
            कक्षा आवंटन: <strong className="text-slate-800">{assignedClassesText}</strong>
          </p>
        </div>
      </div>

      {/* iOS PWA Installation Banner */}
      {isIOS && !isStandalone && (
        <Card className="border border-amber-300 bg-amber-50 p-3 shadow-sm">
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-900">
              <span>📱</span>
              <span>iPhone / iPad: होम स्क्रीन पर जोड़ना आवश्यक है (Install GateSathi)</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Apple iOS पर विज़िटर सूचनाएं (Push Notifications) पाने के लिए GateSathi को Safari की होम स्क्रीन पर जोड़ना अनिवार्य है:
            </p>
            <ol className="list-decimal list-inside text-[11px] text-amber-800 space-y-0.5">
              <li>Safari के नीचे <strong>शेयर (Share)</strong> बटन पर टैप करें।</li>
              <li><strong>&apos;Add to Home Screen&apos; (होम स्क्रीन में जोड़ें)</strong> चुनें।</li>
              <li>होम स्क्रीन पर बने <strong>GateSathi</strong> आइकन से खोलें और सूचनाएं चालू करें।</li>
            </ol>
            <p className="text-[10px] text-amber-700 italic">
              (iOS requires installing GateSathi as a PWA to enable push notifications. Tap Share &rarr; Add to Home Screen, then open from Home Screen.)
            </p>
          </div>
        </Card>
      )}

      {/* Push Notification Bar */}
      {pushStatus !== 'subscribed' && (
        <Card className="border border-blue-200 bg-blue-50/80 p-3 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs">
            <div>
              <p className="font-bold text-blue-950">
                🔔 विज़िटर पिकअप सूचनाएं चालू करें (Enable Visitor Notifications)
              </p>
              <p className="text-[11px] text-blue-700 mt-0.5">
                गेट पर आए आगंतुक की तुरंत मंज़ूरी के लिए अपने फ़ोन पर सूचनाएं चालू करें।
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pushLoading || pushStatus === 'unsupported'}
              onClick={handleSubscribePush}
              className="h-8 shrink-0 bg-brand-blue text-xs font-bold text-white hover:bg-brand-blue/90 border-transparent"
            >
              {pushLoading ? 'चालू हो रहा है...' : 'सूचनाएं चालू करें (Enable)'}
            </Button>
          </div>
        </Card>
      )}

      {/* Messages */}
      {errorMsg && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-red-700"
        >
          {errorMsg}
        </p>
      )}
      {successMsg && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-medium text-emerald-800"
        >
          {successMsg}
        </p>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => {
            setActiveTab('pending');
            setLoading(true);
          }}
          className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
            activeTab === 'pending'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>मंज़ूरी अनुरोध (Pending)</span>
          {pendingRequests.length > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
              {pendingRequests.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('history');
            setLoading(true);
          }}
          className={`border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
            activeTab === 'history'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          30 दिनों का इतिहास (History)
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-500">
          लोड हो रहा है (Loading)...
        </div>
      ) : activeTab === 'pending' ? (
        pendingRequests.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent className="space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">
                ✓
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                कोई लंबित अनुरोध नहीं है
              </h3>
              <p className="text-xs text-slate-500">
                जब भी कोई गैर-स्वीकृत आगंतुक छात्र को ले जाने आएगा, यहाँ तुरंत दिखेगा।
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((req) => {
              const isEscalated = req.status === 'escalated';
              const isProcessing = processingId === req._id;
              const isRejecting = rejectingId === req._id;

              return (
                <Card
                  key={req._id}
                  className={`overflow-hidden border-2 ${
                    isEscalated
                      ? 'border-amber-400 bg-amber-50/20'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <CardHeader className="bg-slate-50/80 p-3 pb-2 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                          {req.visit?.purpose || 'छात्र को ले जाना (Pickup)'}
                        </span>
                        {isEscalated && (
                          <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800 animate-pulse">
                            एस्केलेटेड (5+ min)
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {formatWaitingTime(req.createdAt)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 space-y-3">
                    {/* Visitor & Student Details */}
                    <div className="flex gap-3">
                      {/* Photo */}
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                        {req.visitor?.signedPhotoUrl ? (
                          <Image
                            src={req.visitor.signedPhotoUrl}
                            alt={req.visitor.name || 'Visitor'}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-2xl text-slate-400">
                            👤
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 text-xs space-y-1">
                        <div>
                          <p className="text-[11px] text-slate-500 font-medium">
                            आगंतुक (Visitor)
                          </p>
                          <h4 className="font-bold text-slate-900 truncate">
                            {req.visitor?.name || 'अज्ञात आगंतुक'}
                          </h4>
                          <p className="text-slate-600">
                            संबंध:{' '}
                            <strong className="text-slate-800">
                              {req.visitor?.defaultRelation || 'अभिभावक'}
                            </strong>{' '}
                            | {req.visitor?.phone}
                          </p>
                        </div>

                        <div className="pt-1 border-t border-slate-100">
                          <p className="text-[11px] text-slate-500 font-medium">
                            छात्र (Student)
                          </p>
                          <p className="font-bold text-brand-blue truncate">
                            {req.student?.name} (कक्षा {req.student?.className}-
                            {req.student?.section})
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Guard's Reason */}
                    {(req.visit?.reasonCode || req.visit?.reasonText) && (
                      <div className="rounded bg-slate-50 p-2 text-xs text-slate-700 border border-slate-100">
                        <span className="font-semibold text-slate-900">
                          गेट गार्ड का कारण:
                        </span>{' '}
                        {req.visit?.reasonCode}{' '}
                        {req.visit?.reasonText && `(${req.visit.reasonText})`}
                      </div>
                    )}

                    {/* Add as approved guardian checkbox */}
                    <div className="flex items-center gap-2 pt-1">
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
                        className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                      />
                      <label
                        htmlFor={`guardian-${req._id}`}
                        className="text-xs font-medium text-slate-700 cursor-pointer"
                      >
                        भविष्य के लिए स्वीकृत अभिभावक सूची में जोड़ें (Add as approved guardian)
                      </label>
                    </div>

                    {/* Inline Reject Note Form */}
                    {isRejecting ? (
                      <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
                        <Label htmlFor={`note-${req._id}`} className="text-xs font-bold text-red-900">
                          अस्वीकार करने का कारण दर्ज करें (अनिवार्य):
                        </Label>
                        <Input
                          id={`note-${req._id}`}
                          placeholder="उदा. अभिभावक ने फोन पर मना किया / अज्ञात व्यक्ति"
                          value={rejectNote}
                          onChange={(e) => setRejectNote(e.target.value)}
                          className="h-9 text-xs bg-white"
                          autoFocus
                        />
                        <div className="flex gap-2 justify-end">
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
                            रद्द करें
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={isProcessing}
                            onClick={() => handleDecision(req._id, 'reject')}
                            className="h-8 text-xs font-semibold"
                          >
                            {isProcessing ? 'सहेजा जा रहा है...' : 'अस्वीकार पुष्टि करें'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Action Buttons */
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          disabled={isProcessing}
                          onClick={() => handleDecision(req._id, 'approve')}
                          className="h-10 bg-emerald-600 hover:bg-emerald-700 font-bold text-white text-xs"
                        >
                          {isProcessing ? 'सत्यापित हो रहा है...' : '✓ मंज़ूरी दें (Approve)'}
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
                          className="h-10 border-red-300 text-red-700 hover:bg-red-50 font-bold text-xs"
                        >
                          ✕ अस्वीकार (Reject)
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        /* History Tab (30 days) */
        <div className="space-y-3">
          {historyRequests.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              पिछले 30 दिनों में कोई निर्णय दर्ज नहीं है।
            </div>
          ) : (
            historyRequests.map((req) => (
              <Card key={req._id} className="p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      req.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {req.status === 'approved' ? 'स्वीकृत (Approved)' : 'अस्वीकृत (Rejected)'}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {req.decidedAt
                      ? new Date(req.decidedAt).toLocaleString('hi-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </span>
                </div>
                <div className="flex justify-between text-slate-800">
                  <span>
                    <strong>{req.visitor?.name}</strong> &rarr; छात्र: {req.student?.name} (कक्षा{' '}
                    {req.student?.className}-{req.student?.section})
                  </span>
                </div>
                {req.note && (
                  <p className="text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded">
                    टिप्पणी: {req.note}
                  </p>
                )}
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
