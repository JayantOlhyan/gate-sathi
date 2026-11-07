'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import imageCompression from 'browser-image-compression';
import {
  Camera,
  Check,
  Clock,
  Hourglass,
  Phone,
  Search,
  User as UserIcon,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  GUARDIAN_RELATIONS,
  UNAPPROVED_REASON_CODES,
  type GuardianRelation,
  type UnapprovedReasonCode,
} from '@/lib/constants';
import { gatePurposes, type GatePurpose } from '@/lib/validations';
import {
  enqueueOfflineVisit,
  getOfflineVisitsCount,
  syncOfflineVisits,
  getFailedVisits,
  retryFailedVisit,
  dismissFailedVisit,
  type FailedVisitRecord,
  type OfflineVisitPayload,
} from '@/lib/offline-queue';

const CONSENT_VERSION = 'v1.1';

interface LinkedStudentItem {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string;
  section: string;
  rollNumber?: string;
  relation?: GuardianRelation;
}

interface SearchStudentItem {
  _id: string;
  name: string;
  admissionNo: string;
  className: string;
  section: string;
  rollNumber?: string;
}

interface RecentApprovalItem {
  requestId: string;
  visitId: string;
  status: 'pending' | 'escalated' | 'approved' | 'rejected' | 'expired';
  visitorName: string;
  relation: string;
  studentName: string;
  className: string;
  section: string;
  purpose: string;
  teacherName: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
}

type GateStep =
  | 'phone'
  | 'otp'
  | 'consent'
  | 'entry'
  | 'waiting_teacher'
  | 'confirmed'
  | 'offline_blocked';

function formatElapsedMmSs(createdAtIso: string | null, nowMs: number): string {
  if (!createdAtIso) return '00:00';
  const diffSec = Math.max(
    0,
    Math.floor((nowMs - new Date(createdAtIso).getTime()) / 1000)
  );
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatShortElapsed(createdAtIso: string | null, nowMs: number): string {
  if (!createdAtIso) return '0:00';
  const diffSec = Math.max(
    0,
    Math.floor((nowMs - new Date(createdAtIso).getTime()) / 1000)
  );
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function GateClient({
  schoolId,
  mockOtpActive = false,
}: {
  schoolId: string;
  mockOtpActive?: boolean;
}) {
  const t = useTranslations('gate');
  const tGuardian = useTranslations('guardians');

  const [step, setStep] = useState<GateStep>('phone');
  const [phone, setPhone] = useState('');
  const [isKnownVisitor, setIsKnownVisitor] = useState(false);

  // OTP state (new visitors)
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [consentAt, setConsentAt] = useState<string | null>(null);

  // Visitor details (P0.2: relation starts empty for new visitors)
  const [visitorName, setVisitorName] = useState('');
  const [relation, setRelation] = useState<GuardianRelation | ''>('');
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoFallbackWarning, setPhotoFallbackWarning] = useState(false);

  // Offline queue state
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [failedVisits, setFailedVisits] = useState<FailedVisitRecord[]>([]);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);
  const [offlineBlockedPayload, setOfflineBlockedPayload] =
    useState<OfflineVisitPayload | null>(null);

  // Inside count & recent approvals strip (P0.3)
  const [insideCount, setInsideCount] = useState<number>(0);
  const [recentApprovals, setRecentApprovals] = useState<RecentApprovalItem[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Students selection
  const [linkedStudents, setLinkedStudents] = useState<LinkedStudentItem[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<
    Map<string, LinkedStudentItem>
  >(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchStudentItem[]>([]);
  const [showOtherChildSearch, setShowOtherChildSearch] = useState(false);

  // Purpose & approval
  const [purpose, setPurpose] = useState<GatePurpose | ''>('');
  const [purposeNote, setPurposeNote] = useState('');
  const [reasonCode, setReasonCode] = useState<UnapprovedReasonCode | ''>('');
  const [reasonText, setReasonText] = useState('');
  const [clientId, setClientId] = useState<string>(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Teacher approval waiting / decision state
  const [savedVisitId, setSavedVisitId] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<
    'pending' | 'escalated' | 'approved' | 'rejected' | 'expired'
  >('pending');
  const [approvingTeacherName, setApprovingTeacherName] = useState<string>('');
  const [decidedByName, setDecidedByName] = useState<string | null>(null);
  const [decidedAt, setDecidedAt] = useState<string | null>(null);
  const [teacherNotes, setTeacherNotes] = useState<string[]>([]);
  const [requestCreatedAt, setRequestCreatedAt] = useState<string | null>(null);
  const [escalationMinutes, setEscalationMinutes] = useState<number>(5);
  const [expiryMinutes, setExpiryMinutes] = useState<number>(30);
  const [officePhone, setOfficePhone] = useState<string | null>(null);
  const [waitingVisitorName, setWaitingVisitorName] = useState<string>('');
  const [waitingRelation, setWaitingRelation] = useState<string>('');
  const [waitingStudentLabel, setWaitingStudentLabel] = useState<string>('');
  const [waitingClassLabel, setWaitingClassLabel] = useState<string>('');
  const [waitingPurpose, setWaitingPurpose] = useState<string>('Pickup');

  // Tick 1s timer when on phone strip or waiting_teacher screen
  useEffect(() => {
    if (step !== 'waiting_teacher' && step !== 'phone') return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  const fetchPhoneScreenContext = useCallback(async () => {
    if (!schoolId) return;
    if (
      typeof document !== 'undefined' &&
      document.visibilityState !== 'visible'
    ) {
      return;
    }
    try {
      const [recentRes, insideRes] = await Promise.all([
        fetch(
          `/api/gate/approvals/recent?schoolId=${encodeURIComponent(schoolId)}`
        ),
        fetch(
          `/api/gate/visits/inside?schoolId=${encodeURIComponent(schoolId)}`
        ),
      ]);
      if (recentRes.ok) {
        const recentData = await recentRes.json();
        setRecentApprovals(recentData.items ?? []);
        if (typeof recentData.escalationMinutes === 'number') {
          setEscalationMinutes(recentData.escalationMinutes);
        }
        if (typeof recentData.expiryMinutes === 'number') {
          setExpiryMinutes(recentData.expiryMinutes);
        }
      }
      if (insideRes.ok) {
        const insideData = await insideRes.json();
        setInsideCount(Array.isArray(insideData.visits) ? insideData.visits.length : 0);
      }
    } catch {
      // Ignore transient network errors when offline
    }
  }, [schoolId]);

  // Poll recent approvals strip & inside count every 10s when on phone screen
  useEffect(() => {
    if (step !== 'phone' || !schoolId) return;
    let cancelled = false;
    const run = async () => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      ) {
        return;
      }
      try {
        const [recentRes, insideRes] = await Promise.all([
          fetch(
            `/api/gate/approvals/recent?schoolId=${encodeURIComponent(schoolId)}`
          ),
          fetch(
            `/api/gate/visits/inside?schoolId=${encodeURIComponent(schoolId)}`
          ),
        ]);
        if (cancelled) return;
        if (recentRes.ok) {
          const recentData = await recentRes.json();
          if (!cancelled) {
            setRecentApprovals(recentData.items ?? []);
            if (typeof recentData.escalationMinutes === 'number') {
              setEscalationMinutes(recentData.escalationMinutes);
            }
            if (typeof recentData.expiryMinutes === 'number') {
              setExpiryMinutes(recentData.expiryMinutes);
            }
          }
        }
        if (insideRes.ok) {
          const insideData = await insideRes.json();
          if (!cancelled) {
            setInsideCount(
              Array.isArray(insideData.visits) ? insideData.visits.length : 0
            );
          }
        }
      } catch {
        // Ignore transient network errors when offline
      }
    };
    void run();
    const interval = setInterval(() => {
      void run();
    }, 10000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void run();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [step, schoolId]);

  const resetToStart = useCallback(() => {
    setStep('phone');
    setPhone('');
    setIsKnownVisitor(false);
    setOtpSent(false);
    setOtpCode('');
    setConsentAt(null);
    setVisitorName('');
    setRelation('');
    setPhotoKey(null);
    setPhotoBlob(null);
    setPhotoPreviewUrl(null);
    setPhotoFallbackWarning(false);
    setLinkedStudents([]);
    setSelectedStudents(new Map());
    setSearchQuery('');
    setSearchResults([]);
    setShowOtherChildSearch(false);
    setPurpose('');
    setPurposeNote('');
    setReasonCode('');
    setReasonText('');
    setClientId(
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : ''
    );
    setErrorMsg(null);
    setSavedVisitId(null);
    setApprovalStatus('pending');
    setApprovingTeacherName('');
    setDecidedByName(null);
    setDecidedAt(null);
    setTeacherNotes([]);
    setRequestCreatedAt(null);
    setOfflineBlockedPayload(null);
    void fetchPhoneScreenContext();
  }, [fetchPhoneScreenContext]);

  const refreshCounts = useCallback(async () => {
    const pending = await getOfflineVisitsCount();
    const failed = await getFailedVisits();
    setPendingSyncCount(pending);
    setFailedVisits(failed);
  }, []);

  const handleManualSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await syncOfflineVisits();
      setPendingSyncCount(res.remaining);
      setSessionExpiredNotice(Boolean(res.sessionExpired));
      const failed = await getFailedVisits();
      setFailedVisits(failed);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // Offline sync listeners and periodic check
  useEffect(() => {
    let cancelled = false;
    getOfflineVisitsCount().then((count) => {
      if (!cancelled) setPendingSyncCount(count);
    });
    getFailedVisits().then((failed) => {
      if (!cancelled) setFailedVisits(failed);
    });

    const triggerSync = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        setIsSyncing(true);
        try {
          const res = await syncOfflineVisits();
          if (!cancelled) {
            setPendingSyncCount(res.remaining);
            setSessionExpiredNotice(Boolean(res.sessionExpired));
            const failed = await getFailedVisits();
            setFailedVisits(failed);
          }
        } finally {
          if (!cancelled) setIsSyncing(false);
        }
      }
    };

    triggerSync();

    const handleOnline = () => {
      triggerSync();
    };

    window.addEventListener('online', handleOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Poll approval status when waiting for teacher
  useEffect(() => {
    if (step !== 'waiting_teacher' || !savedVisitId) return;

    let cancelled = false;
    const pollStatus = async () => {
      try {
        const res = await fetch(
          `/api/gate/visits/${savedVisitId}/approval-status?schoolId=${encodeURIComponent(schoolId)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.status) {
          setApprovalStatus(data.status);
        }
        if (data.teacherName) {
          setApprovingTeacherName(data.teacherName);
        }
        if (data.decidedByName) {
          setDecidedByName(data.decidedByName);
        }
        if (data.decidedAt) {
          setDecidedAt(data.decidedAt);
        }
        if (data.createdAt) {
          setRequestCreatedAt(data.createdAt);
        }
        if (typeof data.escalationMinutes === 'number') {
          setEscalationMinutes(data.escalationMinutes);
        }
        if (typeof data.expiryMinutes === 'number') {
          setExpiryMinutes(data.expiryMinutes);
        }
        if (data.officePhone !== undefined) {
          setOfficePhone(data.officePhone);
        }
        if (data.visitorName) {
          setWaitingVisitorName(data.visitorName);
        }
        if (data.relation) {
          setWaitingRelation(data.relation);
        }
        if (data.purpose) {
          setWaitingPurpose(data.purpose);
        }
        if (Array.isArray(data.requests) && data.requests.length > 0) {
          const firstReq = data.requests[0];
          if (firstReq.studentName) {
            setWaitingStudentLabel(firstReq.studentName);
          }
          if (firstReq.className) {
            setWaitingClassLabel(
              `${firstReq.className}${firstReq.section ? `-${firstReq.section}` : ''}`
            );
          }
        }
        if (data.notes && Array.isArray(data.notes)) {
          setTeacherNotes(data.notes);
        }
      } catch {
        // ignore poll errors
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [step, savedVisitId, schoolId]);

  // Search other students when query changes in 'entry' step
  useEffect(() => {
    if (step !== 'entry' || !searchQuery.trim()) {
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      schoolId,
      q: searchQuery.trim(),
    });

    fetch(`/api/gate/students?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!cancelled && res.ok) {
          setSearchResults(data.students ?? []);
        }
      })
      .catch(() => {
        // ignore transient search error
      });

    return () => {
      cancelled = true;
    };
  }, [schoolId, step, searchQuery]);

  // Auto-reset 2 seconds after confirmation screen
  useEffect(() => {
    if (step !== 'confirmed') return;
    const timer = setTimeout(() => {
      resetToStart();
    }, 2000);
    return () => clearTimeout(timer);
  }, [step, resetToStart]);

  const handleOpenRecentApproval = (item: RecentApprovalItem) => {
    setSavedVisitId(item.visitId);
    setApprovalStatus(item.status);
    setApprovingTeacherName(item.teacherName || 'Principal');
    setDecidedByName(item.decidedByName);
    setDecidedAt(item.decidedAt);
    setTeacherNotes(item.note ? [item.note] : []);
    setRequestCreatedAt(item.createdAt);
    setWaitingVisitorName(item.visitorName);
    setWaitingRelation(item.relation);
    setWaitingStudentLabel(item.studentName);
    setWaitingClassLabel(
      `${item.className}${item.section ? `-${item.section}` : ''}`
    );
    setWaitingPurpose(item.purpose);
    setStep('waiting_teacher');
  };

  const handleLookupPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmed = phone.trim();
    if (!/^[6-9]\d{9}$/.test(trimmed)) {
      setErrorMsg('Invalid 10-digit mobile number');
      return;
    }

    const res = await fetch(
      `/api/gate/lookup?schoolId=${encodeURIComponent(schoolId)}&phone=${encodeURIComponent(trimmed)}`
    );
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error ?? 'Lookup failed');
      return;
    }

    setClientId(crypto.randomUUID());

    if (data.found && data.visitor) {
      setIsKnownVisitor(true);
      setVisitorName(data.visitor.name ?? '');
      setPhotoKey(data.visitor.photoKey ?? null);
      setPhotoPreviewUrl(data.visitor.signedPhotoUrl ?? null);
      setRelation((data.visitor.defaultRelation as GuardianRelation) || '');
      const linked: LinkedStudentItem[] = data.linkedStudents ?? [];
      setLinkedStudents(linked);
      const initialMap = new Map<string, LinkedStudentItem>();
      if (linked.length === 1 && linked[0]) {
        initialMap.set(linked[0].studentId, linked[0]);
      }
      setSelectedStudents(initialMap);
      setShowOtherChildSearch(linked.length === 0);
      setStep('entry');
    } else {
      setIsKnownVisitor(false);
      setVisitorName('');
      setRelation(''); // P0.2: no default relation for new visitors
      setLinkedStudents([]);
      setSelectedStudents(new Map());
      setShowOtherChildSearch(true);
      setStep('otp');
    }
  };

  const handleSendOtp = async () => {
    setErrorMsg(null);
    const res = await fetch('/api/gate/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolId, phone: phone.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error ?? 'Failed to send OTP');
      return;
    }
    setOtpSent(true);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const res = await fetch('/api/gate/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolId,
        phone: phone.trim(),
        code: otpCode.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error ?? 'Invalid OTP');
      return;
    }
    setStep('consent');
  };

  const handleAcceptConsent = () => {
    setConsentAt(new Date().toISOString());
    setStep('entry');
  };

  // P0.5: Photo upload graceful degradation when R2 is unconfigured or fails
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    setPhotoFallbackWarning(false);
    setErrorMsg(null);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.15,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
        fileType: 'image/jpeg',
      });

      setPhotoBlob(compressed);
      const localPreview = URL.createObjectURL(compressed);
      setPhotoPreviewUrl(localPreview);

      try {
        const signRes = await fetch('/api/uploads/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schoolId,
            contentType: 'image/jpeg',
            contentLength: compressed.size,
          }),
        });
        const signData = await signRes.json().catch(() => ({}));
        if (signRes.ok && signData.uploadUrl) {
          const putRes = await fetch(signData.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: compressed,
          }).catch(() => null);

          if (putRes && putRes.ok) {
            setPhotoKey(signData.photoKey);
          } else {
            setPhotoFallbackWarning(true);
          }
        } else {
          setPhotoFallbackWarning(true);
        }
      } catch {
        setPhotoFallbackWarning(true);
      }
    } catch {
      setPhotoFallbackWarning(true);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const toggleStudent = (s: LinkedStudentItem) => {
    setSelectedStudents((prev) => {
      const next = new Map(prev);
      if (next.has(s.studentId)) {
        next.delete(s.studentId);
      } else {
        next.set(s.studentId, s);
      }
      return next;
    });
  };

  const linkedStudentIdSet = new Set(linkedStudents.map((s) => s.studentId));
  const selectedIds = Array.from(selectedStudents.keys());
  const selectedStudentsList = Array.from(selectedStudents.values());
  const isAllSelectedApproved =
    selectedIds.length > 0 &&
    selectedIds.every((id) => linkedStudentIdSet.has(id));

  // P0.4: Compute first missing requirement hint for sticky bottom bar
  const getMissingHint = (): string | null => {
    if (!visitorName.trim()) return t('missingNameHint');
    if (!relation) return t('missingRelationHint');
    if (selectedIds.length === 0) return t('missingStudentHint');
    if (!purpose) return t('missingPurposeHint');
    if (purpose === 'Other' && !purposeNote.trim()) return t('missingPurposeHint');
    if (!isAllSelectedApproved) {
      if (!reasonCode) return t('missingReasonHint');
      if (reasonCode === 'Other' && reasonText.trim().length < 5) {
        return t('missingReasonOtherHint');
      }
    }
    return null;
  };

  const missingHint = getMissingHint();
  const isFormValid = missingHint === null && !uploadingPhoto && !submitting;

  const submitVisitToServer = async () => {
    if (!purpose) return;

    setSubmitting(true);
    const isUnapprovedPickup = purpose === 'Pickup' && !isAllSelectedApproved;
    const effectiveRelation: GuardianRelation = (relation || 'Other') as GuardianRelation;
    const nowIso = new Date().toISOString();

    const visitPayload: OfflineVisitPayload = {
      schoolId,
      clientId,
      phone: phone.trim(),
      name: visitorName.trim(),
      relation: effectiveRelation,
      photoKey: photoKey ?? undefined,
      consentAt: consentAt ?? undefined,
      consentVersion: consentAt ? CONSENT_VERSION : undefined,
      studentIds: selectedIds,
      purpose,
      purposeNote: purpose === 'Other' ? purposeNote.trim() : undefined,
      reasonCode: !isAllSelectedApproved && reasonCode ? reasonCode : undefined,
      reasonText:
        !isAllSelectedApproved && reasonText.trim()
          ? reasonText.trim()
          : undefined,
      entryAt: nowIso,
    };

    // If offline, check child safety rule
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (isUnapprovedPickup) {
        setOfflineBlockedPayload(visitPayload);
        setStep('offline_blocked');
        setSubmitting(false);
        return;
      }

      await enqueueOfflineVisit({
        clientId,
        schoolId,
        payload: visitPayload,
        photoBlob,
        createdAt: Date.now(),
      });
      await refreshCounts();
      setStep('confirmed');
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/gate/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visitPayload),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Failed to save visit');
        return;
      }

      if (data.approvalRequests && data.approvalRequests.length > 0) {
        const firstStudent = selectedStudentsList[0];
        setSavedVisitId(data.visit?._id ?? data.visit?.id);
        const tNames = Array.from(
          new Set(
            data.approvalRequests
              .map((r: any) => r.teacherName)
              .filter(Boolean)
          )
        );
        setApprovingTeacherName(
          tNames.length > 0 ? tNames.join(', ') : 'Principal'
        );
        setApprovalStatus('pending');
        setTeacherNotes([]);
        setRequestCreatedAt(nowIso);
        setWaitingVisitorName(visitorName.trim());
        setWaitingRelation(reasonCode || effectiveRelation);
        setWaitingStudentLabel(firstStudent?.name ?? '');
        setWaitingClassLabel(
          firstStudent ? `${firstStudent.className}-${firstStudent.section}` : ''
        );
        setWaitingPurpose(purpose);
        setNowMs(Date.now());
        setStep('waiting_teacher');
        return;
      }

      setStep('confirmed');
    } catch {
      if (isUnapprovedPickup) {
        setOfflineBlockedPayload(visitPayload);
        setStep('offline_blocked');
      } else {
        try {
          await enqueueOfflineVisit({
            clientId,
            schoolId,
            payload: visitPayload,
            photoBlob,
            createdAt: Date.now(),
          });
          await refreshCounts();
          setStep('confirmed');
        } catch {
          setErrorMsg('Network error saving visit');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (missingHint) {
      setErrorMsg(missingHint);
      return;
    }
    await submitVisitToServer();
  };

  // Screen 05 & 06 (a/r/e): Waiting & Decision screens
  if (step === 'waiting_teacher') {
    const isApproved = approvalStatus === 'approved';
    const isRejected = approvalStatus === 'rejected';
    const isEscalated = approvalStatus === 'escalated';
    const isExpired = approvalStatus === 'expired';

    const createdMs = requestCreatedAt
      ? new Date(requestCreatedAt).getTime()
      : nowMs;
    const elapsedSec = Math.max(0, Math.floor((nowMs - createdMs) / 1000));
    const escalationTotalSec = Math.max(60, escalationMinutes * 60);
    const remainingToEscalateSec = Math.max(0, escalationTotalSec - elapsedSec);
    const remMins = Math.floor(remainingToEscalateSec / 60);
    const remSecs = remainingToEscalateSec % 60;
    const remTimeFormatted = `${remMins}:${String(remSecs).padStart(2, '0')}`;
    const progressPct = Math.min(
      100,
      Math.round((elapsedSec / escalationTotalSec) * 100)
    );

    const decidedTimeStr = decidedAt
      ? new Date(decidedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    // 06-approved
    if (isApproved) {
      return (
        <div className="rounded-xl border-2 border-[#059669] bg-emerald-50/70 p-5 text-center shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#059669] text-white shadow-sm">
            <Check className="h-9 w-9 stroke-[3]" />
          </div>
          <h2 className="mt-4 text-xl font-extrabold text-emerald-950">
            {t('approvedHeading')}
          </h2>
          <p className="mt-1 text-xs font-medium text-emerald-800">
            {decidedTimeStr
              ? t('approvedByAt', {
                  name: decidedByName || approvingTeacherName || 'Teacher',
                  time: decidedTimeStr,
                })
              : decidedByName || approvingTeacherName}
          </p>

          <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-3.5 text-center shadow-2xs">
            <p className="text-base font-bold text-slate-900">
              {waitingStudentLabel}
              {waitingClassLabel ? `, Class ${waitingClassLabel}` : ''}
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              {waitingVisitorName}
              {waitingRelation ? ` (${waitingRelation})` : ''}
            </p>
          </div>

          {teacherNotes.length > 0 && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-white/90 p-2.5 text-xs text-emerald-950">
              <span className="font-semibold">{t('teacherNoteLabel')}:</span>{' '}
              {teacherNotes.join('; ')}
            </div>
          )}

          <Button
            type="button"
            onClick={resetToStart}
            className="mt-5 h-12 w-full rounded-lg bg-[#059669] text-sm font-bold text-white hover:bg-[#047857]"
          >
            {t('nextEntryBtn')}
          </Button>
        </div>
      );
    }

    // 06-rejected
    if (isRejected) {
      return (
        <div className="rounded-xl border-2 border-[#DC2626] bg-red-50/80 p-5 text-center shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#DC2626] text-white shadow-sm">
            <X className="h-9 w-9 stroke-[3]" />
          </div>
          <h2 className="mt-4 text-xl font-extrabold text-red-950">
            {t('rejectedHeading')}
          </h2>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {waitingStudentLabel}
            {waitingClassLabel ? `, Class ${waitingClassLabel}` : ''}
          </p>

          <div className="mt-3 rounded-xl border border-red-200 bg-white p-3 text-left text-xs text-slate-800 shadow-2xs">
            <span className="font-bold text-slate-900">
              {decidedByName || approvingTeacherName || 'Teacher'}:
            </span>{' '}
            &ldquo;{teacherNotes.length > 0 ? teacherNotes.join('; ') : t('rejectedSub')}&rdquo;
          </div>

          <div className="mt-3 rounded-xl border border-[#F59E0B] bg-[#FFFBEB] p-3 text-xs font-bold text-amber-950">
            {t('rejectedWarningBox')}
          </div>

          <Button
            type="button"
            onClick={resetToStart}
            className="mt-5 h-12 w-full rounded-lg bg-brand-blue text-sm font-bold text-white hover:bg-brand-blue/90"
          >
            {t('nextEntryBtn')}
          </Button>
        </div>
      );
    }

    // 06-expired
    if (isExpired) {
      return (
        <div className="rounded-xl border-2 border-slate-300 bg-white p-5 text-center shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-slate-700">
            <Clock className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-lg font-extrabold text-slate-900">
            {t('expiredHeading')}
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-600">
            {t('expiredAfterMinutes', { minutes: expiryMinutes })}
          </p>

          <div className="mt-4 space-y-2.5">
            {officePhone && (
              <a
                href={`tel:${officePhone}`}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 hover:bg-slate-50"
              >
                <Phone className="h-4 w-4" />
                {t('callOfficeBtn')}
              </a>
            )}
            <Button
              type="button"
              onClick={resetToStart}
              className="h-12 w-full rounded-lg bg-brand-blue text-sm font-bold text-white hover:bg-brand-blue/90"
            >
              {t('nextEntryBtn')}
            </Button>
          </div>
        </div>
      );
    }

    // Ref 05: Waiting for class teacher
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 text-center shadow-xs">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFFBEB] ring-2 ring-[#F59E0B]/40">
          <Hourglass className="h-7 w-7 animate-pulse text-[#F59E0B]" />
        </div>

        <h2 className="mt-3 text-lg font-bold text-slate-900">
          {t('waitingTeacherHeading')}
        </h2>
        <p className="mt-0.5 text-xs font-medium text-slate-600">
          {approvingTeacherName}
          {waitingClassLabel ? ` · Class ${waitingClassLabel}` : ''}
        </p>

        <div className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 tabular-nums">
          {formatElapsedMmSs(requestCreatedAt, nowMs)}
        </div>

        <div className="mt-2 space-y-1.5">
          <p className="text-xs font-medium text-slate-600">
            {isEscalated || remainingToEscalateSec === 0
              ? t('escalatedNotice')
              : t('goesToPrincipalIn', { time: remTimeFormatted })}
          </p>
          <div className="mx-auto h-1.5 w-48 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#F59E0B] transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-xs">
          <div className="flex items-center justify-between py-1">
            <span className="text-slate-500">{t('requestSummaryVisitor')}</span>
            <span className="font-semibold text-slate-900">
              {waitingVisitorName}
              {waitingRelation ? ` (${waitingRelation})` : ''}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200/70 py-1">
            <span className="text-slate-500">{t('requestSummaryStudent')}</span>
            <span className="font-semibold text-slate-900">
              {waitingStudentLabel}
              {waitingClassLabel ? `, ${waitingClassLabel}` : ''}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200/70 py-1">
            <span className="text-slate-500">{t('requestSummaryPurpose')}</span>
            <span className="font-semibold text-slate-900">
              {t(`purposes.${waitingPurpose as GatePurpose}`)}
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {officePhone && (
            <a
              href={`tel:${officePhone}`}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Phone className="h-3.5 w-3.5" />
              {t('callOfficeBtn')}
            </a>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={resetToStart}
            className="h-10 w-full rounded-lg border-slate-300 text-xs font-semibold text-slate-700"
          >
            {t('backToGateKeepsTracking')}
          </Button>
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-brand-blue" />
          {t('waitingLiveStatus')}
        </p>
      </div>
    );
  }

  if (step === 'confirmed') {
    return (
      <div className="rounded-xl border-2 border-[#059669] bg-emerald-50 p-6 text-center shadow-xs">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#059669] text-white">
          <Check className="h-8 w-8 stroke-[3]" />
        </div>
        <h2 className="mt-3 text-lg font-bold text-emerald-950">
          {t('confirmedHeading')}
        </h2>
        <p className="mt-1 text-xs text-emerald-800">{t('confirmedSub')}</p>
      </div>
    );
  }

  if (step === 'offline_blocked') {
    return (
      <div className="rounded-xl border-2 border-[#DC2626] bg-red-50 p-5 text-center shadow-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#DC2626] text-white">
          <X className="h-9 w-9 stroke-[3]" />
        </div>
        <h2 className="mt-3 text-base font-bold text-red-950">
          {t('offlinePickupBlockedTitle')}
        </h2>
        <p className="mt-1 text-xs font-semibold text-red-900 leading-relaxed">
          {t('offlinePickupBlockedDesc')}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full border-red-400 bg-white text-red-900 hover:bg-red-100"
            onClick={resetToStart}
          >
            {t('backToGateBtn')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full border border-red-300 bg-red-100 text-xs text-slate-800 hover:bg-red-200"
            onClick={async () => {
              if (offlineBlockedPayload) {
                await enqueueOfflineVisit({
                  clientId,
                  schoolId,
                  payload: {
                    ...offlineBlockedPayload,
                    pickupBlocked: true,
                  },
                  photoBlob,
                  createdAt: Date.now(),
                });
                await refreshCounts();
                setStep('confirmed');
              }
            }}
          >
            {t('offlineLogAnywayBtn')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* Thin amber banner in test mode */}
      {mockOtpActive && (
        <div
          role="status"
          className="rounded-lg border border-[#F59E0B] bg-[#FFFBEB] px-3 py-1.5 text-center text-xs font-bold tracking-wide text-amber-900"
        >
          {t('testModeOtpBanner')}
        </div>
      )}

      {/* Session Expired Notice */}
      {sessionExpiredNotice && (
        <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 p-2.5 text-xs font-semibold text-red-900">
          <span>⚠️ {t('sessionExpiredWarning')}</span>
          <Link
            href="/login"
            className="ml-2 shrink-0 text-xs font-bold text-red-700 underline"
          >
            लॉग इन
          </Link>
        </div>
      )}

      {/* Failed Sync Items (NO SILENT LOSS) */}
      {failedVisits.length > 0 && (
        <div className="space-y-2 rounded-xl border border-red-400 bg-red-50 p-3 text-xs text-red-950">
          <div className="flex items-center gap-1.5 font-bold text-red-900">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>
              {failedVisits.length === 1
                ? t('failedSyncBannerOne')
                : t('failedSyncBannerMany', { count: failedVisits.length })}
            </span>
          </div>
          <div className="space-y-1.5">
            {failedVisits.map((item) => (
              <div
                key={item.clientId}
                className="flex flex-col justify-between gap-2 rounded-lg border border-red-200 bg-white p-2.5 text-xs sm:flex-row sm:items-center"
              >
                <div>
                  <p className="font-bold text-slate-900">
                    {item.payload.name} ({item.payload.phone}) —{' '}
                    {item.payload.purpose}
                  </p>
                  <p className="mt-0.5 text-[11px] text-red-700">
                    {item.error}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-slate-300 text-[11px]"
                    onClick={async () => {
                      await retryFailedVisit(item.clientId);
                      await refreshCounts();
                      handleManualSync();
                    }}
                  >
                    {t('failedSyncRetry')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] text-slate-500 hover:text-red-700"
                    onClick={async () => {
                      await dismissFailedVisit(item.clientId);
                      await refreshCounts();
                    }}
                  >
                    {t('failedSyncDismiss')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Offline Sync Status Badge */}
      {pendingSyncCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-[#F59E0B] bg-[#FFFBEB] p-2.5 text-xs text-amber-900">
          <span className="font-semibold">
            ☁️ {pendingSyncCount} ऑफ़लाइन प्रविष्टियाँ सिंक की प्रतीक्षा में
          </span>
          <Button
            type="button"
            size="sm"
            disabled={isSyncing}
            onClick={handleManualSync}
            className="h-7 bg-amber-700 text-[11px] text-white hover:bg-amber-800"
          >
            {isSyncing ? '...' : 'Sync'}
          </Button>
        </div>
      )}

      {errorMsg && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          {errorMsg}
        </p>
      )}

      {/* Ref 02: Guard Home — Phone Lookup + Pending Approvals Strip */}
      {step === 'phone' && (
        <div className="space-y-3.5">
          {/* P0.3 Pending / Recent Approvals Strip */}
          {recentApprovals.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-600">
                {t('pendingApprovalsStripTitle')} ({recentApprovals.length})
              </p>
              <div className="grid grid-cols-2 gap-2">
                {recentApprovals.slice(0, 4).map((item) => {
                  const isItemApproved = item.status === 'approved';
                  const isItemRejected = item.status === 'rejected';
                  const isItemExpired = item.status === 'expired';
                  const elapsed = formatShortElapsed(item.createdAt, nowMs);

                  return (
                    <button
                      key={item.requestId}
                      type="button"
                      onClick={() => handleOpenRecentApproval(item)}
                      className={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition-colors ${
                        isItemApproved
                          ? 'border-[#059669] bg-emerald-50/70'
                          : isItemRejected
                          ? 'border-[#DC2626] bg-red-50/70'
                          : isItemExpired
                          ? 'border-slate-300 bg-slate-100'
                          : 'border-[#F59E0B] bg-[#FFFBEB]'
                      }`}
                    >
                      <p className="truncate text-xs font-bold text-slate-900">
                        {item.visitorName} → {item.studentName} ({item.className}
                        {item.section ? `-${item.section}` : ''})
                      </p>
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold">
                        {isItemApproved ? (
                          <span className="inline-flex items-center gap-1 text-[#059669]">
                            <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                            {t('stripApprovedBy', {
                              name:
                                item.decidedByName ||
                                item.teacherName ||
                                'Teacher',
                            })}
                          </span>
                        ) : isItemRejected ? (
                          <span className="inline-flex items-center gap-1 text-[#DC2626]">
                            <X className="h-3.5 w-3.5 stroke-[2.5]" />
                            {t('stripRejectedBy', {
                              name:
                                item.decidedByName ||
                                item.teacherName ||
                                'Teacher',
                            })}
                          </span>
                        ) : isItemExpired ? (
                          <span className="inline-flex items-center gap-1 text-slate-600">
                            <Clock className="h-3.5 w-3.5" />
                            {t('stripExpired')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-800">
                            <Hourglass className="h-3.5 w-3.5" />
                            {t('stripWaitingTime', { time: elapsed })}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Main Phone Lookup Card */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-xs">
            <h2 className="text-lg font-bold text-slate-900">{t('title')}</h2>
            <form onSubmit={handleLookupPhone} className="mt-3 space-y-3.5">
              <div className="space-y-1.5">
                <Label
                  htmlFor="visitorPhone"
                  className="text-xs font-semibold text-slate-700"
                >
                  {t('phoneStepLabel')}
                </Label>
                <Input
                  id="visitorPhone"
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  maxLength={10}
                  placeholder={t('phonePlaceholder')}
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
                  }
                  required
                  className="h-12 rounded-lg border-slate-300 text-lg font-bold tracking-wider"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full rounded-lg bg-brand-blue text-sm font-bold text-white hover:bg-brand-blue/90"
              >
                {t('lookupBtn')}
              </Button>
            </form>
          </div>

          {/* Inside Now Button */}
          <Link
            href="/gate/inside"
            className="flex h-11 w-full items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-4 text-xs font-bold text-slate-800 shadow-2xs hover:bg-slate-50"
          >
            {t('insideNowCount', { count: insideCount })}
          </Link>
        </div>
      )}

      {/* New Visitor OTP verification */}
      {step === 'otp' && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-brand-blue">
              {t('newVisitorBadge')}
            </span>
            <button
              type="button"
              onClick={resetToStart}
              className="text-xs font-semibold text-brand-blue hover:underline"
            >
              {phone} · {t('changePhone')}
            </button>
          </div>

          {!otpSent ? (
            <Button
              type="button"
              size="lg"
              className="h-12 w-full rounded-lg bg-brand-blue text-sm font-bold text-white hover:bg-brand-blue/90"
              onClick={() => void handleSendOtp()}
            >
              {t('sendOtpBtn')} ({phone})
            </Button>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="otpInput" className="text-xs font-semibold">
                  {t('otpLabel')}
                </Label>
                <Input
                  id="otpInput"
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  required
                  className="h-12 text-center text-lg font-bold tracking-widest"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full rounded-lg bg-brand-blue text-sm font-bold text-white hover:bg-brand-blue/90"
              >
                {t('verifyOtpBtn')}
              </Button>
            </form>
          )}
        </div>
      )}

      {/* Consent Screen */}
      {step === 'consent' && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-xs space-y-3 text-xs">
          <h3 className="text-sm font-bold text-slate-900">
            {t('consentHeading')}
          </h3>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-800">
            <p className="font-medium leading-relaxed">{t('consentHi')}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">
            <p className="leading-relaxed">{t('consentEn')}</p>
          </div>
          <Button
            type="button"
            size="lg"
            className="h-12 w-full rounded-lg bg-brand-blue text-sm font-bold text-white hover:bg-brand-blue/90"
            onClick={handleAcceptConsent}
          >
            {t('acceptConsentBtn')}
          </Button>
        </div>
      )}

      {/* Ref 03 (Known Guardian) & Ref 04 (New/Unlisted Visitor) */}
      {step === 'entry' && (
        <form onSubmit={handleSaveVisit} className="space-y-3 pb-16">
          {/* Top Visitor Card */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-3.5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isKnownVisitor
                    ? 'bg-emerald-100 text-[#059669]'
                    : 'bg-blue-100 text-brand-blue'
                }`}
              >
                {isKnownVisitor && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                {isKnownVisitor ? t('knownVisitorBadge') : t('newVisitorBadge')}
              </span>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-semibold text-slate-700">{phone}</span>
                <button
                  type="button"
                  onClick={resetToStart}
                  className="font-bold text-brand-blue hover:underline"
                >
                  {t('changePhone')}
                </button>
              </div>
            </div>

            {isKnownVisitor ? (
              /* Ref 03 compact known guardian header */
              <div className="flex items-center justify-between gap-3 pt-0.5">
                <div className="flex items-center gap-2.5">
                  {photoPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoPreviewUrl}
                      alt={visitorName}
                      className="h-11 w-11 rounded-full border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <UserIcon className="h-5 w-5" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {visitorName}
                    </p>
                    {relation ? (
                      <p className="text-xs text-slate-500">
                        {tGuardian(`relations.${relation}`)}
                      </p>
                    ) : (
                      <select
                        id="knownVisitorRelation"
                        value={relation}
                        onChange={(e) =>
                          setRelation(e.target.value as GuardianRelation | '')
                        }
                        required
                        className="mt-1 flex h-8 rounded-md border border-amber-400 bg-white px-2 py-1 text-xs text-slate-700"
                      >
                        <option value="">{t('selectRelationPlaceholder')}</option>
                        {GUARDIAN_RELATIONS.map((rel) => (
                          <option key={rel} value={rel}>
                            {tGuardian(`relations.${rel}`)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <Label
                  htmlFor="cameraInput"
                  className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {photoPreviewUrl ? t('retakePhoto') : t('capturePhoto')}
                </Label>
                <input
                  id="cameraInput"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => void handlePhotoCapture(e)}
                  className="hidden"
                />
              </div>
            ) : (
              /* Ref 04 New Visitor photo + name + required relation */
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {photoPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoPreviewUrl}
                      alt={visitorName || 'Visitor'}
                      className="h-14 w-14 shrink-0 rounded-xl border border-slate-300 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                      <Camera className="h-5 w-5" />
                      <span className="mt-0.5 text-[10px] font-medium">
                        {t('photoTileLabel')}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor="cameraInput"
                      className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-slate-50"
                    >
                      <Camera className="h-4 w-4 text-slate-600" />
                      {photoPreviewUrl ? t('retakePhoto') : t('capturePhoto')}
                    </Label>
                    <input
                      id="cameraInput"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => void handlePhotoCapture(e)}
                      className="hidden"
                    />
                    {uploadingPhoto && (
                      <p className="text-[11px] text-slate-500">
                        {t('uploadingPhoto')}
                      </p>
                    )}
                    {photoFallbackWarning && !uploadingPhoto && (
                      <p className="text-[11px] text-amber-700">
                        {t('photoFallbackNote')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label
                    htmlFor="visitorName"
                    className="text-xs font-semibold text-slate-700"
                  >
                    {t('visitorNameLabel')}
                  </Label>
                  <Input
                    id="visitorName"
                    value={visitorName}
                    onChange={(e) => setVisitorName(e.target.value)}
                    required
                    className="h-10 rounded-lg border-slate-300 text-sm"
                  />
                </div>

                {/* P0.2 Required Relation Dropdown with no pre-selected Father */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="visitorRelation"
                      className="text-xs font-semibold text-slate-700"
                    >
                      {t('visitorRelationLabel')} *
                    </Label>
                    <span className="text-[11px] font-semibold text-red-600">
                      {t('requiredIndicator')}
                    </span>
                  </div>
                  <select
                    id="visitorRelation"
                    value={relation}
                    onChange={(e) =>
                      setRelation(e.target.value as GuardianRelation | '')
                    }
                    required
                    className={`flex h-10 w-full rounded-lg border bg-white px-3 py-1.5 text-sm ${
                      !relation
                        ? 'border-amber-400 text-slate-500'
                        : 'border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="">{t('selectRelationPlaceholder')}</option>
                    {GUARDIAN_RELATIONS.map((rel) => (
                      <option key={rel} value={rel}>
                        {tGuardian(`relations.${rel}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Student Selection Card */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-3.5 shadow-xs space-y-2.5">
            {linkedStudents.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-slate-700">
                  {t('linkedStudentsHeading')}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {linkedStudents.map((ls) => {
                    const active = selectedStudents.has(ls.studentId);
                    return (
                      <button
                        key={ls.studentId}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleStudent(ls)}
                        className={`flex min-h-12 w-full items-center justify-between rounded-xl border px-3.5 py-2 text-left transition-colors ${
                          active
                            ? 'border-brand-blue bg-brand-blue text-white'
                            : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-bold">{ls.name}</p>
                          <p
                            className={`text-xs ${
                              active ? 'text-white/85' : 'text-slate-500'
                            }`}
                          >
                            {ls.admissionNo} · Class {ls.className}-{ls.section}
                          </p>
                        </div>
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                            active
                              ? 'bg-white text-brand-blue'
                              : 'border border-slate-300 text-slate-400'
                          }`}
                        >
                          {active ? <Check className="h-4 w-4 stroke-[3]" /> : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!showOtherChildSearch && (
                  <button
                    type="button"
                    onClick={() => setShowOtherChildSearch(true)}
                    className="pt-1 text-xs font-semibold text-brand-blue hover:underline"
                  >
                    + {t('searchStudentsLabel')}
                  </button>
                )}
              </div>
            )}

            {showOtherChildSearch && (
              <div className="space-y-2">
                <Label
                  htmlFor="studentSearch"
                  className="text-xs font-bold text-slate-700"
                >
                  {t('searchStudentsLabel')}
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="studentSearch"
                    placeholder={t('searchStudentsPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchQuery(val);
                      if (!val.trim()) {
                        setSearchResults([]);
                      }
                    }}
                    className="h-10 rounded-lg border-slate-300 pl-9 text-xs"
                  />
                </div>

                {searchResults.length > 0 && (
                  <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-1.5">
                    {searchResults.map((sr) => {
                      const item: LinkedStudentItem = {
                        studentId: sr._id,
                        name: sr.name,
                        admissionNo: sr.admissionNo,
                        className: sr.className,
                        section: sr.section,
                        rollNumber: sr.rollNumber,
                      };
                      const active = selectedStudents.has(sr._id);
                      return (
                        <button
                          key={sr._id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleStudent(item)}
                          className={`flex min-h-11 w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                            active
                              ? 'border-brand-blue bg-brand-blue text-white'
                              : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
                          }`}
                        >
                          <span>
                            {sr.name} · Class {sr.className}-{sr.section} (
                            {sr.admissionNo})
                          </span>
                          <Check
                            className={`h-4 w-4 ${
                              active ? 'opacity-100' : 'opacity-0'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Selected non-linked students chips */}
                {selectedStudentsList.filter(
                  (s) => !linkedStudentIdSet.has(s.studentId)
                ).length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {selectedStudentsList
                      .filter((s) => !linkedStudentIdSet.has(s.studentId))
                      .map((s) => (
                        <button
                          key={s.studentId}
                          type="button"
                          aria-pressed={true}
                          onClick={() => toggleStudent(s)}
                          className="flex min-h-11 w-full items-center justify-between rounded-xl border border-brand-blue bg-brand-blue px-3.5 py-2 text-left text-xs font-bold text-white"
                        >
                          <span>
                            {s.name} · Class {s.className}-{s.section}
                          </span>
                          <Check className="h-4 w-4 stroke-[3]" />
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Purpose Grid Card */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-3.5 shadow-xs space-y-2.5">
            <p className="text-xs font-bold text-slate-700">
              {t('purposeHeading')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {gatePurposes.map((p) => {
                const active = purpose === p;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPurpose(p)}
                    className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-bold transition-colors ${
                      active
                        ? 'border-brand-blue bg-brand-blue text-white'
                        : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    {active && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    <span>{t(`purposes.${p}`)}</span>
                  </button>
                );
              })}
            </div>
            {purpose === 'Other' && (
              <Input
                placeholder={t('purposeOtherPlaceholder')}
                value={purposeNote}
                onChange={(e) => setPurposeNote(e.target.value)}
                required
                className="h-10 text-xs"
              />
            )}
          </div>

          {/* Unapproved Warning & Reason Chips (Ref 04) */}
          {selectedIds.length > 0 && !isAllSelectedApproved && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3.5 space-y-2.5 text-xs">
              <p className="flex items-center gap-1.5 font-bold text-red-900">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#DC2626]" />
                <span>{t('unapprovedStatus')}</span>
              </p>

              <p className="text-[11px] font-semibold text-red-800">
                {t('unapprovedReasonLabel')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {UNAPPROVED_REASON_CODES.map((rc) => {
                  const active = reasonCode === rc;
                  return (
                    <button
                      key={rc}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setReasonCode(rc)}
                      className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-bold transition-colors ${
                        active
                          ? 'border-brand-blue bg-brand-blue text-white'
                          : 'border-red-200 bg-white text-slate-800 hover:bg-red-100/50'
                      }`}
                    >
                      {active && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      <span>{t(`reasons.${rc}`)}</span>
                    </button>
                  );
                })}
              </div>

              {reasonCode === 'Other' && (
                <div className="space-y-1 pt-1">
                  <Label
                    htmlFor="unapprovedReasonText"
                    className="text-xs font-semibold text-red-900"
                  >
                    {t('unapprovedReasonOtherLabel')}
                  </Label>
                  <Input
                    id="unapprovedReasonText"
                    placeholder={t('unapprovedReasonPlaceholder')}
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    required
                    minLength={5}
                    className="h-10 border-red-300 bg-white text-xs"
                  />
                </div>
              )}
            </div>
          )}

          {/* Sticky Bottom Action Bar (Ref 03 & Ref 04 + P0.4 hint) */}
          <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[360px] -translate-x-1/2 border-t border-[#E2E8F0] bg-white/95 px-4 py-2.5 backdrop-blur-xs">
            <p
              className={`mb-1.5 text-center text-[11px] font-semibold ${
                missingHint ? 'text-amber-700' : 'text-[#059669]'
              }`}
            >
              {missingHint ? missingHint : `✓ ${t('readyToSave')}`}
            </p>
            <Button
              type="submit"
              size="lg"
              disabled={!isFormValid}
              className={`h-11 w-full rounded-lg text-sm font-bold text-white ${
                isAllSelectedApproved
                  ? 'bg-[#059669] hover:bg-[#047857]'
                  : 'bg-brand-blue hover:bg-brand-blue/90'
              }`}
            >
              {submitting
                ? t('savingVisit')
                : !isAllSelectedApproved && purpose === 'Pickup'
                ? t('sendForApprovalBtn')
                : t('saveVisitBtn')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
