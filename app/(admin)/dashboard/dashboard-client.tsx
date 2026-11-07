'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Check,
  Clock,
  Download,
  FileText,
  Home,
  LayoutDashboard,
  Search,
  Users,
  GraduationCap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageToggle } from '@/components/language-toggle';
import { LogoutButton } from '@/components/logout-button';

interface ApprovalRequestItem {
  _id: string;
  schoolId: string;
  visitId: string;
  studentId: string;
  visitorId: string;
  teacherId: string | null;
  teacherName: string | null;
  status: 'pending' | 'escalated' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
  escalatedAt?: string;
  student?: {
    name: string;
    className: string;
    section: string;
  };
  visitor?: {
    name: string;
    phone: string;
    defaultRelation?: string;
    signedPhotoUrl?: string | null;
  };
  visit?: {
    purpose: string;
    reasonCode?: string;
    reasonText?: string;
  };
}

interface TeacherItem {
  _id: string;
  name: string;
  phone: string;
  isActive: boolean;
  hasPushSubscription?: boolean;
  classAssignments: Array<{ className: string; section: string }>;
}

interface TodayStats {
  insideNow: number;
  entriesToday: number;
  pendingApprovals: number;
  pickupsApprovedToday: number;
}

interface TodayVisitRow {
  visitId: string;
  entryAt: string;
  exitAt: string | null;
  visitorName: string;
  maskedPhone: string;
  relation: string;
  students: Array<{
    name: string;
    className: string;
    section: string;
  }>;
  purpose: string;
  status: 'Exited' | 'Inside' | 'Approved' | 'Rejected' | 'Pending';
}

export function DashboardClient({
  schoolId,
  schoolName,
  udiseCode,
  district,
  state,
  logoutLabel,
}: {
  schoolId: string;
  schoolName: string;
  udiseCode: string;
  district: string;
  state: string;
  logoutLabel: string;
}) {
  const t = useTranslations('dashboard');
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeView: 'overview' | 'teachers' =
    searchParams.get('tab') === 'teachers' ? 'teachers' : 'overview';

  const setActiveView = (nextView: 'overview' | 'teachers') => {
    if (nextView === 'teachers') {
      router.replace('/dashboard?tab=teachers');
    } else {
      router.replace('/dashboard');
    }
  };
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Stats & Visits today
  const [stats, setStats] = useState<TodayStats>({
    insideNow: 0,
    entriesToday: 0,
    pendingApprovals: 0,
    pickupsApprovedToday: 0,
  });
  const [visitsToday, setVisitsToday] = useState<TodayVisitRow[]>([]);
  const [logSearch, setLogSearch] = useState('');

  // Escalated / Pending requests
  const [requests, setRequests] = useState<ApprovalRequestItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Teachers
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [showImportTeachers, setShowImportTeachers] = useState(false);
  const [teacherName, setTeacherName] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [teacherClass, setTeacherClass] = useState('5');
  const [teacherSection, setTeacherSection] = useState('A');
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  // General messages
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = useCallback(async () => {
    if (!schoolId) return;
    if (
      typeof document !== 'undefined' &&
      document.visibilityState !== 'visible'
    ) {
      return;
    }
    try {
      const [approvalsRes, statsRes, visitsRes] = await Promise.all([
        fetch(`/api/schools/${schoolId}/approvals`),
        fetch(`/api/schools/${schoolId}/stats/today`),
        fetch(`/api/schools/${schoolId}/visits/today?limit=50`),
      ]);
      if (approvalsRes.ok) {
        const aData = await approvalsRes.json();
        setRequests(aData.requests || []);
      }
      if (statsRes.ok) {
        const sData = await statsRes.json();
        setStats({
          insideNow: sData.insideNow ?? 0,
          entriesToday: sData.entriesToday ?? 0,
          pendingApprovals: sData.pendingApprovals ?? 0,
          pickupsApprovedToday: sData.pickupsApprovedToday ?? 0,
        });
      }
      if (visitsRes.ok) {
        const vData = await visitsRes.json();
        setVisitsToday(vData.visits || []);
      }
    } catch {
      // ignore poll network errors
    } finally {
      setRequestsLoading(false);
    }
  }, [schoolId]);

  const fetchTeachers = useCallback(async () => {
    if (!schoolId) return;
    setTeachersLoading(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/teachers`);
      if (res.ok) {
        const data = await res.json();
        setTeachers(data.teachers || []);
      }
    } catch {
      // ignore
    } finally {
      setTeachersLoading(false);
    }
  }, [schoolId]);

  // Poll dashboard data every 10s
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    const run = async () => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      ) {
        return;
      }
      try {
        const [approvalsRes, statsRes, visitsRes] = await Promise.all([
          fetch(`/api/schools/${schoolId}/approvals`),
          fetch(`/api/schools/${schoolId}/stats/today`),
          fetch(`/api/schools/${schoolId}/visits/today?limit=50`),
        ]);
        if (cancelled) return;
        if (approvalsRes.ok) {
          const aData = await approvalsRes.json();
          if (!cancelled) setRequests(aData.requests || []);
        }
        if (statsRes.ok) {
          const sData = await statsRes.json();
          if (!cancelled) {
            setStats({
              insideNow: sData.insideNow ?? 0,
              entriesToday: sData.entriesToday ?? 0,
              pendingApprovals: sData.pendingApprovals ?? 0,
              pickupsApprovedToday: sData.pickupsApprovedToday ?? 0,
            });
          }
        }
        if (visitsRes.ok) {
          const vData = await visitsRes.json();
          if (!cancelled) setVisitsToday(vData.visits || []);
        }
      } catch {
        // ignore poll network errors
      } finally {
        if (!cancelled) setRequestsLoading(false);
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
  }, [schoolId]);

  // Load teachers on mount
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/schools/${schoolId}/teachers`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setTeachers(data.teachers || []);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setTeachersLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

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
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Error saving decision');
        return;
      }

      setSuccessMsg(
        decision === 'approve'
          ? t('principalApprovedMsg')
          : t('principalRejectedMsg')
      );
      setRejectingId(null);
      setRejectNote('');
      await fetchDashboardData();
    } catch {
      setErrorMsg('Network error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleAddTeacher = async (
    resolution?: 'use_existing' | 'update_name'
  ) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSavingTeacher(true);

    try {
      const res = await fetch(`/api/schools/${schoolId}/teachers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: teacherName.trim(),
          phone: teacherPhone.trim(),
          classAssignments: [
            {
              className: teacherClass.trim(),
              section: teacherSection.trim().toUpperCase(),
            },
          ],
          resolution,
        }),
      });

      const data = await res.json();
      if (res.status === 409 && data.conflict) {
        if (
          confirm(
            `Phone ${data.conflict.phone} is already registered to "${data.conflict.existingName}". OK = keep existing name, Cancel = update to new name.`
          )
        ) {
          await handleAddTeacher('use_existing');
        } else {
          await handleAddTeacher('update_name');
        }
        return;
      }

      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to add teacher');
        return;
      }

      setSuccessMsg(`${teacherName} added!`);
      setShowAddTeacher(false);
      setTeacherName('');
      setTeacherPhone('');
      await fetchTeachers();
    } catch {
      setErrorMsg('Network error');
    } finally {
      setSavingTeacher(false);
    }
  };

  const handleToggleTeacherActive = async (teacher: TeacherItem) => {
    try {
      const res = await fetch(
        `/api/schools/${schoolId}/teachers/${teacher._id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isActive: !teacher.isActive,
          }),
        }
      );
      if (res.ok) {
        await fetchTeachers();
      }
    } catch {
      setErrorMsg('Error toggling teacher status');
    }
  };

  const handleImportTeachers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    setImporting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const fd = new FormData();
    fd.append('file', importFile);

    try {
      const res = await fetch(`/api/schools/${schoolId}/teachers/import`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Import failed');
        return;
      }
      setSuccessMsg(`Imported: ${data.created} created, ${data.updated} updated`);
      setShowImportTeachers(false);
      await fetchTeachers();
    } catch {
      setErrorMsg('Network error importing file');
    } finally {
      setImporting(false);
    }
  };

  const handleExportTodayCsv = () => {
    if (visitsToday.length === 0) return;
    const header = [
      'Entry Time',
      'Visitor Name',
      'Phone',
      'Relation',
      'Student',
      'Purpose',
      'Status',
      'Exit Time',
    ];
    const rows = visitsToday.map((v) => {
      const timeIn = new Date(v.entryAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const timeOut = v.exitAt
        ? new Date(v.exitAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
        : '—';
      const studentStr = v.students
        .map((s) => `${s.name} (${s.className}-${s.section})`)
        .join('; ');
      return [
        timeIn,
        `"${v.visitorName.replace(/"/g, '""')}"`,
        v.maskedPhone,
        v.relation,
        `"${studentStr.replace(/"/g, '""')}"`,
        v.purpose,
        v.status,
        timeOut,
      ].join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gatesathi-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const teachersWithoutNotifications = teachers.filter(
    (tc) => tc.isActive && !tc.hasPushSubscription
  );

  const filteredVisits = visitsToday.filter((v) => {
    if (!logSearch.trim()) return true;
    const q = logSearch.trim().toLowerCase();
    const matchVisitor = v.visitorName.toLowerCase().includes(q);
    const matchStudent = v.students.some((s) =>
      s.name.toLowerCase().includes(q)
    );
    return matchVisitor || matchStudent;
  });

  const renderStatusPill = (status: TodayVisitRow['status']) => {
    if (status === 'Exited') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
          ✓ {t('statusExited')}
        </span>
      );
    }
    if (status === 'Inside') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-[#059669]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#059669]" />
          {t('statusInside')}
        </span>
      );
    }
    if (status === 'Approved') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-[#059669]">
          ✓ {t('statusApproved')}
        </span>
      );
    }
    if (status === 'Rejected') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-[#DC2626]">
          ✕ {t('statusRejected')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFBEB] px-2.5 py-0.5 text-[11px] font-bold text-amber-800 border border-[#F59E0B]/40">
        ⏳ {t('statusPending')}
      </span>
    );
  };

  const renderApprovalCard = (req: ApprovalRequestItem) => {
    const isProcessing = processingId === req._id;
    const isRejecting = rejectingId === req._id;
    const elapsedMins = Math.max(
      1,
      Math.floor((nowMs - new Date(req.createdAt).getTime()) / 60000)
    );

    return (
      <div
        key={req._id}
        className="rounded-xl border-2 border-[#F59E0B] bg-white p-3.5 shadow-2xs space-y-2.5"
      >
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFBEB] px-2.5 py-0.5 text-[11px] font-bold text-amber-900 border border-[#F59E0B]/40">
            <Clock className="h-3 w-3 text-[#F59E0B]" />
            {t('escalatedMins', { count: elapsedMins })}
          </span>
          {req.teacherName && (
            <span className="text-[11px] text-slate-500">
              {req.teacherName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {req.visitor?.signedPhotoUrl && (
            <Image
              src={req.visitor.signedPhotoUrl}
              alt={req.visitor.name || 'Visitor'}
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg border border-slate-200 object-cover"
              unoptimized
            />
          )}
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-bold text-slate-900">
              {req.visitor?.name} &rarr; {req.student?.name}
            </p>
            <p className="text-slate-600">
              Class {req.student?.className}-{req.student?.section} ·{' '}
              {req.visit?.purpose || 'Pickup'} (
              {req.visit?.reasonCode ||
                req.visitor?.defaultRelation ||
                'Relative'}
              )
            </p>
          </div>
        </div>

        {isRejecting ? (
          <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/60 p-2.5 text-xs">
            <Label className="font-bold text-red-900">
              {t('rejectReasonLabel')}
            </Label>
            <Input
              placeholder={t('rejectReasonPlaceholder')}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              className="h-8 bg-white text-xs"
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
                className="h-7 text-xs"
              >
                {t('cancelBtn')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isProcessing}
                onClick={() => void handleDecision(req._id, 'reject')}
                className="h-7 bg-[#DC2626] text-xs font-bold text-white hover:bg-red-700"
              >
                {t('confirmRejectBtn')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isProcessing}
              onClick={() => void handleDecision(req._id, 'approve')}
              className="h-9 rounded-lg bg-[#059669] text-xs font-bold text-white hover:bg-[#047857]"
            >
              ✓ {t('approveBtn')}
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
              className="h-9 rounded-lg border-[#DC2626] text-xs font-bold text-[#DC2626] hover:bg-red-50"
            >
              ✕ {t('rejectBtn')}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-dvh flex-1">
      {/* Desktop Left Sidebar (>=1024px, Ref 12) */}
      <aside className="hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:justify-between lg:bg-brand-blue lg:p-4 lg:text-white">
        <div className="space-y-6">
          <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
            <Image
              src="/brand/icon-white.png"
              alt="GateSathi"
              width={32}
              height={32}
              className="h-8 w-8 shrink-0"
            />
            <span className="text-lg font-extrabold tracking-tight text-white">
              GateSathi
            </span>
          </Link>

          <nav className="space-y-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => {
                setActiveView('overview');
                router.replace('/dashboard');
              }}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                activeView === 'overview'
                  ? 'bg-white/15 text-white'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>{t('navDashboard')}</span>
            </button>

            <a
              href="#gate-log"
              onClick={() => setActiveView('overview')}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              <FileText className="h-4 w-4" />
              <span>{t('navGateLog')}</span>
            </a>

            <Link
              href="/students"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              <GraduationCap className="h-4 w-4" />
              <span>{t('navStudents')}</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                setActiveView('teachers');
                router.replace('/dashboard?tab=teachers');
              }}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                activeView === 'teachers'
                  ? 'bg-white/15 text-white'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>{t('navTeachers')}</span>
            </button>
          </nav>
        </div>

        <div className="border-t border-white/15 pt-3 px-2 text-xs text-white/80">
          <p className="font-bold text-white truncate">{schoolName}</p>
          <p className="truncate text-[11px] text-white/70">
            {[district, state].filter(Boolean).join(', ') ||
              (udiseCode ? `UDISE ${udiseCode}` : '')}
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-8">
        {/* Desktop Top Header (>=1024px, Ref 12) */}
        <header className="hidden lg:flex lg:h-16 lg:items-center lg:justify-between lg:border-b lg:border-[#E2E8F0] lg:bg-white lg:px-6">
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">
              {schoolName}
            </h1>
            {udiseCode && (
              <p className="text-xs font-medium text-slate-500">
                UDISE {udiseCode}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-600">
              {t('todayLabel')},{' '}
              {new Date().toLocaleDateString([], {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            <LanguageToggle />
            <div className="rounded-lg bg-brand-blue px-1">
              <LogoutButton label={logoutLabel} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[360px] flex-1 space-y-4 p-3.5 lg:max-w-none lg:space-y-6 lg:p-6">
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

          {activeView === 'overview' ? (
            <>
              {/* Stat Tiles: 3 on mobile (Ref 11), 4 on desktop (Ref 12) */}
              <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-4 lg:gap-4">
                <div className="rounded-xl border border-[#E2E8F0] bg-white p-3 lg:p-4 shadow-2xs">
                  <p className="text-[11px] font-medium text-slate-500 lg:text-xs">
                    {t('statInsideNow')}
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-900 lg:text-3xl">
                    {stats.insideNow}
                  </p>
                </div>

                <div className="rounded-xl border border-[#E2E8F0] bg-white p-3 lg:p-4 shadow-2xs">
                  <p className="text-[11px] font-medium text-slate-500 lg:text-xs">
                    {t('statEntriesToday')}
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-900 lg:text-3xl">
                    {stats.entriesToday}
                  </p>
                </div>

                {/* Desktop-only 3rd tile: Pickups approved */}
                <div className="hidden lg:block rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs">
                  <p className="text-xs font-medium text-slate-500">
                    {t('statPickupsApproved')}
                  </p>
                  <p className="mt-1 text-3xl font-extrabold text-[#059669]">
                    {stats.pickupsApprovedToday}
                  </p>
                </div>

                <div
                  className={`rounded-xl border p-3 lg:p-4 shadow-2xs ${
                    stats.pendingApprovals > 0
                      ? 'border-[#F59E0B] bg-[#FFFBEB]'
                      : 'border-[#E2E8F0] bg-white'
                  }`}
                >
                  <p className="text-[11px] font-medium text-amber-900 lg:text-xs">
                    {t('statPendingApprovals')}
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-[#D97706] lg:text-3xl">
                    {stats.pendingApprovals}
                  </p>
                </div>
              </div>

              {/* Mobile Warning Banner: Teachers without notifications (Ref 11) */}
              {teachersWithoutNotifications.length > 0 && (
                <div className="lg:hidden rounded-xl border border-[#F59E0B] bg-[#FFFBEB] px-3.5 py-2.5 text-xs font-bold text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[#F59E0B]" />
                  <span>
                    {t('teachersNoNotificationsAlert', {
                      count: teachersWithoutNotifications.length,
                    })}{' '}
                    (
                    {teachersWithoutNotifications
                      .map((tc) =>
                        tc.classAssignments
                          .map((a) => `Class ${a.className}-${a.section}`)
                          .join(', ')
                      )
                      .filter(Boolean)
                      .join(', ')}
                    )
                  </span>
                </div>
              )}

              {/* Desktop Two-Column Grid / Mobile Stacked */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
                {/* Mobile Needs Your Approval FIRST on mobile, Right Column on Desktop */}
                <div className="order-1 space-y-4 lg:order-2 lg:col-span-1">
                  {/* Needs your approval card */}
                  <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs space-y-3">
                    <h2 className="text-sm font-extrabold text-slate-900">
                      {t('needsYourApprovalTitle')} ({requests.length})
                    </h2>

                    {requestsLoading ? (
                      <p className="py-4 text-center text-xs text-slate-500">
                        {t('loadingRequests')}
                      </p>
                    ) : requests.length === 0 ? (
                      <p className="py-4 text-center text-xs text-slate-500">
                        {t('noPendingRequests')}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {requests.map((req) => renderApprovalCard(req))}
                      </div>
                    )}
                  </div>

                  {/* Desktop Teachers Without Notifications Card (Ref 12) */}
                  {teachersWithoutNotifications.length > 0 && (
                    <div className="hidden lg:block rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs space-y-2.5">
                      <h3 className="flex items-center gap-1.5 text-xs font-extrabold text-amber-900">
                        <AlertTriangle className="h-4 w-4 text-[#F59E0B]" />
                        <span>{t('teachersWithoutNotificationsTitle')}</span>
                      </h3>
                      <div className="divide-y divide-slate-100 text-xs">
                        {teachersWithoutNotifications.map((tc) => (
                          <div
                            key={tc._id}
                            className="flex items-center justify-between py-2"
                          >
                            <span className="font-semibold text-slate-800">
                              {tc.name}
                            </span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                              {tc.classAssignments
                                .map((a) => `Class ${a.className}-${a.section}`)
                                .join(', ') || '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Gate Log (Desktop Left 2 cols) / Recent Entries (Mobile 2nd) */}
                <div
                  id="gate-log"
                  className="order-2 lg:order-1 lg:col-span-2 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs space-y-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-sm font-extrabold text-slate-900 lg:text-base">
                      <span className="lg:hidden">
                        {t('recentEntriesTitle')}
                      </span>
                      <span className="hidden lg:inline">
                        {t('gateLogTitle')}
                      </span>
                    </h2>
                    <div className="hidden lg:flex items-center gap-2">
                      <div className="relative w-56">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder={t('searchLogPlaceholder')}
                          value={logSearch}
                          onChange={(e) => setLogSearch(e.target.value)}
                          className="h-8 rounded-lg border-slate-300 pl-8 text-xs"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleExportTodayCsv}
                        className="h-8 gap-1.5 text-xs font-semibold"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {t('exportCsvBtn')}
                      </Button>
                    </div>
                  </div>

                  {/* Mobile Compact Recent Entries List (Ref 11) */}
                  <div className="divide-y divide-slate-100 lg:hidden">
                    {filteredVisits.length === 0 ? (
                      <p className="py-6 text-center text-xs text-slate-500">
                        {t('noEntriesToday')}
                      </p>
                    ) : (
                      filteredVisits.slice(0, 10).map((v) => {
                        const timeIn = new Date(v.entryAt).toLocaleTimeString(
                          [],
                          {
                            hour: '2-digit',
                            minute: '2-digit',
                          }
                        );
                        const firstStudent = v.students[0];
                        return (
                          <div
                            key={v.visitId}
                            className="flex items-center justify-between py-2.5 text-xs"
                          >
                            <div className="min-w-0 pr-2">
                              <span className="font-semibold text-slate-900">
                                {timeIn} · {v.visitorName}
                              </span>
                              {firstStudent && (
                                <span className="text-slate-600">
                                  {' '}
                                  ({firstStudent.name}, {firstStudent.className}
                                  -{firstStudent.section})
                                </span>
                              )}
                            </div>
                            <div className="shrink-0">
                              {renderStatusPill(v.status)}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Desktop Full Gate Log Table (Ref 12) */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="pb-2.5 font-semibold">
                            {t('colTime')}
                          </th>
                          <th className="pb-2.5 font-semibold">
                            {t('colVisitor')}
                          </th>
                          <th className="pb-2.5 font-semibold">
                            {t('colRelation')}
                          </th>
                          <th className="pb-2.5 font-semibold">
                            {t('colStudent')}
                          </th>
                          <th className="pb-2.5 font-semibold">
                            {t('colPurpose')}
                          </th>
                          <th className="pb-2.5 font-semibold">
                            {t('colStatus')}
                          </th>
                          <th className="pb-2.5 font-semibold">
                            {t('colExit')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredVisits.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="py-8 text-center text-slate-500"
                            >
                              {t('noEntriesToday')}
                            </td>
                          </tr>
                        ) : (
                          filteredVisits.map((v) => {
                            const timeIn = new Date(
                              v.entryAt
                            ).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            });
                            const timeOut = v.exitAt
                              ? new Date(v.exitAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—';
                            const studentStr = v.students
                              .map(
                                (s) => `${s.name} (${s.className}-${s.section})`
                              )
                              .join(', ');
                            return (
                              <tr key={v.visitId} className="hover:bg-slate-50">
                                <td className="py-3 font-medium text-slate-700">
                                  {timeIn}
                                </td>
                                <td className="py-3 font-bold text-slate-900">
                                  {v.visitorName}
                                </td>
                                <td className="py-3 text-slate-600">
                                  {v.relation}
                                </td>
                                <td className="py-3 text-slate-800">
                                  {studentStr || '—'}
                                </td>
                                <td className="py-3 text-slate-700">
                                  {v.purpose}
                                </td>
                                <td className="py-3">
                                  {renderStatusPill(v.status)}
                                </td>
                                <td className="py-3 text-slate-600">
                                  {timeOut}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Teachers Management View */
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-slate-900 lg:text-base">
                  {t('teachersListHeading')} ({teachers.length})
                </h2>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowImportTeachers((v) => !v)}
                    className="h-8 text-xs font-semibold"
                  >
                    {t('importCsvBtn')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setShowAddTeacher((v) => !v)}
                    className="h-8 bg-brand-blue text-xs font-bold text-white"
                  >
                    {t('addTeacherBtn')}
                  </Button>
                </div>
              </div>

              {showAddTeacher && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 space-y-2.5 text-xs">
                  <h3 className="font-bold text-brand-blue">
                    {t('addNewTeacherTitle')}
                  </h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="tName">{t('teacherNameLabel')}</Label>
                      <Input
                        id="tName"
                        value={teacherName}
                        onChange={(e) => setTeacherName(e.target.value)}
                        className="h-9 bg-white text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="tPhone">{t('teacherPhoneLabel')}</Label>
                      <Input
                        id="tPhone"
                        type="tel"
                        maxLength={10}
                        value={teacherPhone}
                        onChange={(e) =>
                          setTeacherPhone(
                            e.target.value.replace(/\D/g, '').slice(0, 10)
                          )
                        }
                        className="h-9 bg-white text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="tClass">{t('teacherClassLabel')}</Label>
                      <Input
                        id="tClass"
                        value={teacherClass}
                        onChange={(e) => setTeacherClass(e.target.value)}
                        className="h-9 bg-white text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="tSection">
                        {t('teacherSectionLabel')}
                      </Label>
                      <Input
                        id="tSection"
                        value={teacherSection}
                        onChange={(e) =>
                          setTeacherSection(e.target.value.toUpperCase())
                        }
                        className="h-9 bg-white text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddTeacher(false)}
                      className="h-8 text-xs"
                    >
                      {t('cancelBtn')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        savingTeacher ||
                        !teacherName.trim() ||
                        teacherPhone.length !== 10 ||
                        !teacherClass.trim()
                      }
                      onClick={() => void handleAddTeacher()}
                      className="h-8 bg-brand-blue text-xs font-bold text-white"
                    >
                      {savingTeacher ? t('savingBtn') : t('saveBtn')}
                    </Button>
                  </div>
                </div>
              )}

              {showImportTeachers && (
                <form
                  onSubmit={handleImportTeachers}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5 text-xs"
                >
                  <p className="font-bold text-slate-900">
                    {t('importTeachersTitle')}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {t('importTeachersHint')}:{' '}
                    <code>name, phone, className, section</code>
                  </p>
                  <Input
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="h-9 bg-white text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowImportTeachers(false)}
                      className="h-8 text-xs"
                    >
                      {t('closeBtn')}
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={importing || !importFile}
                      className="h-8 bg-brand-blue text-xs font-bold text-white"
                    >
                      {importing ? t('importingBtn') : t('uploadAndImportBtn')}
                    </Button>
                  </div>
                </form>
              )}

              {teachersLoading ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  {t('loadingTeachers')}
                </p>
              ) : teachers.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  {t('noTeachersFound')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {teachers.map((tc) => (
                    <div
                      key={tc._id}
                      className="flex items-center justify-between py-3 text-xs"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900">
                            {tc.name}
                          </span>
                          <span className="text-slate-500">({tc.phone})</span>
                          {tc.hasPushSubscription ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-[#059669]">
                              ✓ {t('notificationsActiveBadge')}
                            </span>
                          ) : (
                            <span className="rounded-full bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-[#F59E0B]/40">
                              ⚠ {t('notificationsOffBadge')}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-slate-600">
                          {t('assignedClassesLabel')}:{' '}
                          {tc.classAssignments && tc.classAssignments.length > 0
                            ? tc.classAssignments
                                .map((a) => `Class ${a.className}-${a.section}`)
                                .join(', ')
                            : t('noClassAssigned')}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={tc.isActive ? 'outline' : 'default'}
                        onClick={() => void handleToggleTeacherActive(tc)}
                        className={`h-7 text-[11px] font-semibold ${
                          tc.isActive
                            ? 'border-red-300 text-red-700 hover:bg-red-50'
                            : 'bg-[#059669] text-white'
                        }`}
                      >
                        {tc.isActive ? t('deactivateBtn') : t('activateBtn')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Mobile Bottom Navigation Bar (<1024px, Ref 11 — only existing routes) */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-14 items-center justify-around border-t border-[#E2E8F0] bg-white lg:hidden">
          <button
            type="button"
            onClick={() => {
              setActiveView('overview');
              router.replace('/dashboard');
            }}
            className={`flex flex-col items-center gap-0.5 text-[11px] font-bold ${
              activeView === 'overview' ? 'text-brand-blue' : 'text-slate-400'
            }`}
          >
            <Home className="h-4 w-4" />
            <span>{t('navHome')}</span>
          </button>

          <Link
            href="/students"
            className="flex flex-col items-center gap-0.5 text-[11px] font-bold text-slate-400 hover:text-brand-blue"
          >
            <GraduationCap className="h-4 w-4" />
            <span>{t('navStudents')}</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              setActiveView('teachers');
              router.replace('/dashboard?tab=teachers');
            }}
            className={`flex flex-col items-center gap-0.5 text-[11px] font-bold ${
              activeView === 'teachers' ? 'text-brand-blue' : 'text-slate-400'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>{t('navTeachers')}</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
