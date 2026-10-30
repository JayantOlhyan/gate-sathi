'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import imageCompression from 'browser-image-compression';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GUARDIAN_RELATIONS, type GuardianRelation } from '@/models/GuardianLink';
import { gatePurposes, type GatePurpose } from '@/lib/validations';

const CONSENT_VERSION = 'v1.0';

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

type GateStep =
  | 'phone'
  | 'otp'
  | 'consent'
  | 'entry'
  | 'confirmed';

export function GateClient({ schoolId }: { schoolId: string }) {
  const t = useTranslations('gate');
  const tGuardian = useTranslations('guardians');

  const [step, setStep] = useState<GateStep>('phone');
  const [phone, setPhone] = useState('');
  const [isKnownVisitor, setIsKnownVisitor] = useState(false);

  // OTP state (new visitors)
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [consentAt, setConsentAt] = useState<string | null>(null);

  // Visitor details
  const [visitorName, setVisitorName] = useState('');
  const [relation, setRelation] = useState<GuardianRelation>('Father');
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Students selection
  const [linkedStudents, setLinkedStudents] = useState<LinkedStudentItem[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<
    Map<string, LinkedStudentItem>
  >(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchStudentItem[]>([]);

  // Purpose & approval
  const [purpose, setPurpose] = useState<GatePurpose>('Pickup');
  const [purposeNote, setPurposeNote] = useState('');
  const [unapprovedReason, setUnapprovedReason] = useState('');
  const [clientId, setClientId] = useState<string>(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resetToStart = () => {
    setStep('phone');
    setPhone('');
    setIsKnownVisitor(false);
    setOtpSent(false);
    setOtpCode('');
    setConsentAt(null);
    setVisitorName('');
    setRelation('Father');
    setPhotoKey(null);
    setPhotoPreviewUrl(null);
    setLinkedStudents([]);
    setSelectedStudents(new Map());
    setSearchQuery('');
    setSearchResults([]);
    setPurpose('Pickup');
    setPurposeNote('');
    setUnapprovedReason('');
    setClientId(crypto.randomUUID());
    setErrorMsg(null);
  };

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

  // Step h: Auto-reset 2 seconds after confirmation screen
  useEffect(() => {
    if (step !== 'confirmed') return;
    const timer = setTimeout(() => {
      resetToStart();
    }, 2000);
    return () => clearTimeout(timer);
  }, [step]);

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
      if (data.visitor.defaultRelation) {
        setRelation(data.visitor.defaultRelation);
      }
      const linked: LinkedStudentItem[] = data.linkedStudents ?? [];
      setLinkedStudents(linked);
      // Pre-select single linked student for 1-tap convenience
      const initialMap = new Map<string, LinkedStudentItem>();
      if (linked.length === 1 && linked[0]) {
        initialMap.set(linked[0].studentId, linked[0]);
      }
      setSelectedStudents(initialMap);
      setStep('entry');
    } else {
      setIsKnownVisitor(false);
      setLinkedStudents([]);
      setSelectedStudents(new Map());
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

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    setErrorMsg(null);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.15, // ~150 KB
        maxWidthOrHeight: 1024,
        useWebWorker: true,
        fileType: 'image/jpeg',
      });

      const localPreview = URL.createObjectURL(compressed);
      setPhotoPreviewUrl(localPreview);

      const signRes = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId,
          contentType: 'image/jpeg',
          contentLength: compressed.size,
        }),
      });
      const signData = await signRes.json();
      if (!signRes.ok) {
        setErrorMsg(signData.error ?? 'Failed to sign photo upload');
        return;
      }

      // Attempt PUT to presigned R2 URL (gracefully keep photoKey in dev/preview if bucket is offline)
      await fetch(signData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: compressed,
      }).catch(() => undefined);

      setPhotoKey(signData.photoKey);
    } catch {
      setErrorMsg('Photo compression or upload failed');
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
  const isAllSelectedApproved =
    selectedIds.length > 0 &&
    selectedIds.every((id) => linkedStudentIdSet.has(id));

  const handleSaveVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (selectedIds.length === 0) {
      setErrorMsg('Please select at least one student');
      return;
    }

    if (!isAllSelectedApproved && unapprovedReason.trim().length < 5) {
      setErrorMsg(t('unapprovedReasonLabel'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/gate/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId,
          clientId,
          phone: phone.trim(),
          name: visitorName.trim(),
          relation,
          photoKey: photoKey ?? undefined,
          consentAt: consentAt ?? undefined,
          consentVersion: consentAt ? CONSENT_VERSION : undefined,
          studentIds: selectedIds,
          purpose,
          purposeNote: purpose === 'Other' ? purposeNote.trim() : undefined,
          unapprovedReason: !isAllSelectedApproved
            ? unapprovedReason.trim()
            : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Failed to save visit');
        return;
      }

      setStep('confirmed');
    } catch {
      setErrorMsg('Network error saving visit');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'confirmed') {
    return (
      <Card className="border-2 border-emerald-500 bg-emerald-50 text-center">
        <CardContent className="space-y-3 py-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-2xl font-bold text-white">
            ✓
          </div>
          <h2 className="text-lg font-bold text-emerald-950">
            {t('confirmedHeading')}
          </h2>
          <p className="text-xs text-emerald-800">{t('confirmedSub')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
          {t('badge')}
        </span>
        <Link
          href="/gate/inside"
          className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-xs font-medium text-white shadow"
        >
          {t('insideNowLink')}
        </Link>
      </div>

      {errorMsg && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          {errorMsg}
        </p>
      )}

      {/* Step a: Numeric Phone Input */}
      {step === 'phone' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLookupPhone} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="visitorPhone">{t('phoneStepLabel')}</Label>
                <Input
                  id="visitorPhone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
                  }
                  required
                  className="h-12 text-lg font-semibold tracking-wider"
                />
              </div>
              <Button type="submit" size="lg" className="w-full">
                {t('lookupBtn')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Step c (part 1): New Visitor OTP verification */}
      {step === 'otp' && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                {t('newVisitorBadge')}
              </span>
              <button
                type="button"
                onClick={resetToStart}
                className="text-xs text-slate-600 underline"
              >
                {t('changePhone')} ({phone})
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!otpSent ? (
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={() => void handleSendOtp()}
              >
                {t('sendOtpBtn')} ({phone})
              </Button>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="otpInput">{t('otpLabel')}</Label>
                  <Input
                    id="otpInput"
                    type="tel"
                    inputMode="numeric"
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
                <Button type="submit" size="lg" className="w-full">
                  {t('verifyOtpBtn')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step c (part 2): Bilingual Consent Screen */}
      {step === 'consent' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('consentHeading')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-slate-800">
              <p className="font-medium leading-relaxed">{t('consentHi')}</p>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-slate-700">
              <p className="leading-relaxed">{t('consentEn')}</p>
            </div>
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={handleAcceptConsent}
            >
              {t('acceptConsentBtn')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step b / c / d / e / f / g: Visitor Entry Form */}
      {step === 'entry' && (
        <form onSubmit={handleSaveVisit} className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                    isKnownVisitor
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-indigo-100 text-indigo-900'
                  }`}
                >
                  {isKnownVisitor
                    ? t('knownVisitorBadge')
                    : t('newVisitorBadge')}
                </span>
                <button
                  type="button"
                  onClick={resetToStart}
                  className="text-xs text-slate-600 underline"
                >
                  {t('changePhone')} ({phone})
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {/* Photo display & camera capture */}
              <div className="flex items-center gap-3">
                {photoPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPreviewUrl}
                    alt={visitorName || 'Visitor'}
                    className="h-16 w-16 rounded-lg border border-slate-300 object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100 text-[10px] text-slate-500">
                    No Photo
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor="cameraInput"
                    className="inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 shadow-sm hover:bg-slate-50"
                  >
                    {isKnownVisitor && photoKey
                      ? t('retakePhoto')
                      : t('capturePhoto')}
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
                  {photoKey && !uploadingPhoto && (
                    <p className="text-[11px] text-emerald-700">
                      ✓ {t('photoUploaded')}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="visitorName" className="text-xs">
                  {t('visitorNameLabel')}
                </Label>
                <Input
                  id="visitorName"
                  value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                  required
                  className="h-11 text-sm"
                />
              </div>

              {!isKnownVisitor && (
                <div>
                  <Label htmlFor="visitorRelation" className="text-xs">
                    {t('visitorRelationLabel')}
                  </Label>
                  <select
                    id="visitorRelation"
                    value={relation}
                    onChange={(e) =>
                      setRelation(e.target.value as GuardianRelation)
                    }
                    className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {GUARDIAN_RELATIONS.map((rel) => (
                      <option key={rel} value={rel}>
                        {tGuardian(`relations.${rel}`)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step d: Select Student(s) */}
          <Card>
            <CardContent className="space-y-3 pt-4 text-xs">
              {linkedStudents.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-semibold text-slate-800">
                    {t('linkedStudentsHeading')}
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {linkedStudents.map((ls) => {
                      const active = selectedStudents.has(ls.studentId);
                      return (
                        <button
                          key={ls.studentId}
                          type="button"
                          onClick={() => toggleStudent(ls)}
                          className={`flex min-h-12 w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                            active
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-300 bg-white text-slate-900'
                          }`}
                        >
                          <div>
                            <p className="text-sm font-semibold">{ls.name}</p>
                            <p
                              className={`text-[11px] ${
                                active ? 'text-slate-200' : 'text-slate-600'
                              }`}
                            >
                              {ls.admissionNo} · {ls.className}-{ls.section}
                            </p>
                          </div>
                          <span className="text-xs font-bold">
                            {active ? '✓' : '+'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="studentSearch" className="text-xs">
                  {t('searchStudentsLabel')}
                </Label>
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
                  className="h-10 text-xs"
                />
                {searchResults.length > 0 && (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-slate-200 p-1.5">
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
                          onClick={() => toggleStudent(item)}
                          className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-xs ${
                            active
                              ? 'bg-slate-900 text-white'
                              : 'hover:bg-slate-100'
                          }`}
                        >
                          <span>
                            {sr.name} ({sr.admissionNo} · {sr.className}-
                            {sr.section})
                          </span>
                          <span>{active ? '✓' : '+'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedIds.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-slate-700">
                    {t('selectedStudents')} ({selectedIds.length}):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(selectedStudents.values()).map((s) => (
                      <span
                        key={s.studentId}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-900"
                      >
                        {s.name} ({s.className}-{s.section})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step e: Purpose Chips */}
          <Card>
            <CardContent className="space-y-3 pt-4 text-xs">
              <p className="font-semibold text-slate-800">
                {t('purposeHeading')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {gatePurposes.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPurpose(p)}
                    className={`min-h-11 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                      purpose === p
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-800'
                    }`}
                  >
                    {t(`purposes.${p}`)}
                  </button>
                ))}
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
            </CardContent>
          </Card>

          {/* Step f: Approval Status & Unapproved Reason */}
          {selectedIds.length > 0 && (
            <Card
              className={
                isAllSelectedApproved
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-red-300 bg-red-50'
              }
            >
              <CardContent className="space-y-2.5 pt-4 text-xs">
                <p
                  className={`font-bold ${
                    isAllSelectedApproved ? 'text-emerald-900' : 'text-red-800'
                  }`}
                >
                  {isAllSelectedApproved
                    ? `✓ ${t('approvedStatus')}`
                    : `⚠ ${t('unapprovedStatus')}`}
                </p>

                {!isAllSelectedApproved && (
                  <div className="space-y-1">
                    <Label
                      htmlFor="unapprovedReason"
                      className="text-xs text-red-900"
                    >
                      {t('unapprovedReasonLabel')}
                    </Label>
                    <Input
                      id="unapprovedReason"
                      placeholder={t('unapprovedReasonPlaceholder')}
                      value={unapprovedReason}
                      onChange={(e) => setUnapprovedReason(e.target.value)}
                      required
                      minLength={5}
                      className="h-10 border-red-300 bg-white text-xs"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step g: Save Visit */}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={submitting || uploadingPhoto || selectedIds.length === 0}
          >
            {submitting ? t('savingVisit') : t('saveVisitBtn')}
          </Button>
        </form>
      )}
    </div>
  );
}
