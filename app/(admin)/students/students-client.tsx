'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  FileText,
  GraduationCap,
  Home,
  LayoutDashboard,
  Upload,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageToggle } from '@/components/language-toggle';
import { LogoutButton } from '@/components/logout-button';
import type {
  ImportExecutionSummary,
  MappedPreviewRow,
} from '@/lib/student-import';
import type { ColumnMapping } from '@/lib/validations';

export interface StudentListItem {
  _id: string;
  admissionNo: string;
  name: string;
  className: string;
  section: string;
  rollNumber?: string;
  isActive: boolean;
}

interface RichPreviewRow {
  rowNumber: number;
  admissionNo: string;
  name: string;
  className: string;
  section: string;
  rollNumber: string;
  fatherPhone: string;
  motherPhone: string;
  errors: string[];
  isDuplicate: boolean;
}

const TEN_DIGIT_PHONE = /^[6-9]\d{9}$/;

export function StudentsClient({
  schoolId,
  schoolName = 'GateSathi School',
  udiseCode = '',
  district = '',
  state = '',
  logoutLabel = 'Log out',
}: {
  schoolId: string;
  schoolName?: string;
  udiseCode?: string;
  district?: string;
  state?: string;
  logoutLabel?: string;
}) {
  const t = useTranslations('students');
  const tDash = useTranslations('dashboard');
  const locale = useLocale();

  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [q, setQ] = useState('');
  const [classNameFilter, setClassNameFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add / Edit Student modal state
  const [editingStudent, setEditingStudent] = useState<StudentListItem | null>(
    null
  );
  const [showForm, setShowForm] = useState(false);
  const [formAdmissionNo, setFormAdmissionNo] = useState('');
  const [formName, setFormName] = useState('');
  const [formClass, setFormClass] = useState('');
  const [formSection, setFormSection] = useState('A');
  const [formRollNumber, setFormRollNumber] = useState('');

  // Import state (Ref 13)
  const [showImport, setShowImport] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawObjects, setRawObjects] = useState<Array<Record<string, unknown>>>(
    []
  );
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    admissionNo: '',
    name: '',
    className: '',
    section: '',
    rollNumber: '',
    fatherName: '',
    fatherPhone: '',
    motherName: '',
    motherPhone: '',
    guardianName: '',
    guardianPhone: '',
    guardianRelation: '',
  });
  const [previewRows, setPreviewRows] = useState<MappedPreviewRow[]>([]);
  const [importReport, setImportReport] =
    useState<ImportExecutionSummary | null>(null);
  const [importing, setImporting] = useState(false);

  const refreshStudents = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;

    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (classNameFilter.trim()) params.set('className', classNameFilter.trim());
    if (sectionFilter.trim()) params.set('section', sectionFilter.trim());
    if (includeInactive) params.set('includeInactive', 'true');
    params.set('page', String(page));
    params.set('limit', '10');

    fetch(`/api/schools/${schoolId}/students?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setErrorMsg(data.error ?? 'Failed to load students');
          return;
        }
        setErrorMsg(null);
        setStudents(data.students ?? []);
        setTotalPages(data.pagination?.totalPages ?? 1);
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMsg('Failed to load students');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    schoolId,
    q,
    classNameFilter,
    sectionFilter,
    includeInactive,
    page,
    refreshKey,
  ]);

  const openAddForm = () => {
    setEditingStudent(null);
    setFormAdmissionNo('');
    setFormName('');
    setFormClass('');
    setFormSection('A');
    setFormRollNumber('');
    setShowForm(true);
  };

  const openEditForm = (s: StudentListItem) => {
    setEditingStudent(s);
    setFormAdmissionNo(s.admissionNo);
    setFormName(s.name);
    setFormClass(s.className);
    setFormSection(s.section);
    setFormRollNumber(s.rollNumber ?? '');
    setShowForm(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const payload = {
      admissionNo: formAdmissionNo.trim(),
      name: formName.trim(),
      className: formClass.trim(),
      section: formSection.trim(),
      rollNumber: formRollNumber.trim(),
    };

    const url = editingStudent
      ? `/api/schools/${schoolId}/students/${editingStudent._id}`
      : `/api/schools/${schoolId}/students`;
    const method = editingStudent ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error ?? 'Failed to save student');
      return;
    }

    setShowForm(false);
    refreshStudents();
  };

  const handleToggleActive = async (student: StudentListItem) => {
    const res = await fetch(
      `/api/schools/${schoolId}/students/${student._id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !student.isActive }),
      }
    );
    if (res.ok) {
      refreshStudents();
    }
  };

  const parseFileLocally = async (file: File) => {
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) return;
      const sheet = wb.Sheets[sheetName];
      if (!sheet) return;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
      });
      setRawObjects(rows);
    } catch {
      setRawObjects([]);
    }
  };

  const handlePreviewFile = async (
    fileOverride?: File,
    customMap?: Partial<ColumnMapping>
  ) => {
    const fileToUse = fileOverride ?? selectedFile;
    if (!fileToUse) return;
    setErrorMsg(null);

    const fd = new FormData();
    fd.append('file', fileToUse);
    fd.append('mode', 'preview');
    if (customMap) {
      fd.append('mapping', JSON.stringify(customMap));
    }

    const res = await fetch(`/api/schools/${schoolId}/students/import`, {
      method: 'POST',
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error ?? 'Preview failed');
      return;
    }

    setHeaders(data.headers ?? []);
    setMapping({
      admissionNo: data.suggestedMapping?.admissionNo ?? '',
      name: data.suggestedMapping?.name ?? '',
      className: data.suggestedMapping?.className ?? '',
      section: data.suggestedMapping?.section ?? '',
      rollNumber: data.suggestedMapping?.rollNumber ?? '',
      fatherName: data.suggestedMapping?.fatherName ?? '',
      fatherPhone: data.suggestedMapping?.fatherPhone ?? '',
      motherName: data.suggestedMapping?.motherName ?? '',
      motherPhone: data.suggestedMapping?.motherPhone ?? '',
      guardianName: data.suggestedMapping?.guardianName ?? '',
      guardianPhone: data.suggestedMapping?.guardianPhone ?? '',
      guardianRelation: data.suggestedMapping?.guardianRelation ?? '',
    });
    setPreviewRows(data.previewRows ?? []);
  };

  const handleRunImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setErrorMsg(null);
    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('mode', 'commit');
    fd.append('mapping', JSON.stringify(mapping));

    try {
      const res = await fetch(`/api/schools/${schoolId}/students/import`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Import failed');
        return;
      }

      setImportReport(data);
      refreshStudents();
    } finally {
      setImporting(false);
    }
  };

  // Compute rich preview & validation stats from rawObjects + mapping
  const computeRichRows = (): RichPreviewRow[] => {
    if (rawObjects.length === 0) {
      return previewRows.map((r) => ({
        rowNumber: r.rowNumber,
        admissionNo: r.admissionNo,
        name: r.name,
        className: r.className,
        section: r.section,
        rollNumber: r.rollNumber,
        fatherPhone: '',
        motherPhone: '',
        errors: [],
        isDuplicate: false,
      }));
    }

    const seenAdm = new Set<string>();
    return rawObjects.map((obj, idx) => {
      const pick = (col?: string) => (col ? String(obj[col] ?? '').trim() : '');
      const admissionNo = pick(mapping.admissionNo);
      const name = pick(mapping.name);
      const className = pick(mapping.className);
      const section = pick(mapping.section);
      const rollNumber = pick(mapping.rollNumber);
      const fatherPhone = pick(mapping.fatherPhone);
      const motherPhone = pick(mapping.motherPhone);

      const errors: string[] = [];
      let isDuplicate = false;

      if (!admissionNo) errors.push('Admission No is required');
      else if (seenAdm.has(admissionNo.toLowerCase())) {
        isDuplicate = true;
        errors.push(`Duplicate admission No ${admissionNo}`);
      } else {
        seenAdm.add(admissionNo.toLowerCase());
      }

      if (!name) errors.push('Student name is required');
      if (!className) errors.push('Class is required');
      if (!section) errors.push('Section is required');
      if (fatherPhone && !TEN_DIGIT_PHONE.test(fatherPhone)) {
        errors.push('Father phone must be 10 digits');
      }
      if (motherPhone && !TEN_DIGIT_PHONE.test(motherPhone)) {
        errors.push('Mother phone must be 10 digits');
      }

      return {
        rowNumber: idx + 2,
        admissionNo,
        name,
        className,
        section,
        rollNumber,
        fatherPhone,
        motherPhone,
        errors,
        isDuplicate,
      };
    });
  };

  const richRows = computeRichRows();
  const readyCount = richRows.filter((r) => r.errors.length === 0).length;
  const duplicateCount = richRows.filter((r) => r.isDuplicate).length;
  const needFixingCount = richRows.filter(
    (r) => r.errors.length > 0 && !r.isDuplicate
  ).length;
  const invalidFatherPhoneCount = richRows.filter(
    (r) => r.fatherPhone && !TEN_DIGIT_PHONE.test(r.fatherPhone)
  ).length;

  const handleDownloadPreImportErrors = () => {
    if (importReport?.reportCsv) {
      const blob = new Blob([importReport.reportCsv], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'student-import-report.csv';
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const header = 'rowNumber,admissionNo,name,status,errors';
    const lines = richRows
      .filter((r) => r.errors.length > 0)
      .map(
        (r) =>
          `${r.rowNumber},"${r.admissionNo}","${r.name}",failed,"${r.errors.join('; ')}"`
      );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student-import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentStep = importReport ? 3 : headers.length > 0 ? 2 : 1;

  return (
    <div className="flex min-h-dvh flex-1">
      {/* Desktop Left Sidebar (>=1024px) */}
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
            <Link
              href="/dashboard"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>{tDash('navDashboard')}</span>
            </Link>

            <Link
              href="/dashboard#gate-log"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              <FileText className="h-4 w-4" />
              <span>{tDash('navGateLog')}</span>
            </Link>

            <Link
              href="/students"
              className="flex w-full items-center gap-2.5 rounded-xl bg-white/15 px-3 py-2.5 text-left text-white transition-colors"
            >
              <GraduationCap className="h-4 w-4" />
              <span>{tDash('navStudents')}</span>
            </Link>

            <Link
              href="/dashboard?tab=teachers"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Users className="h-4 w-4" />
              <span>{tDash('navTeachers')}</span>
            </Link>
          </nav>
        </div>

        <div className="border-t border-white/15 px-2 pt-3 text-xs text-white/80">
          <p className="truncate font-bold text-white">{schoolName}</p>
          <p className="truncate text-[11px] text-white/70">
            {[district, state].filter(Boolean).join(', ') ||
              (udiseCode ? `UDISE ${udiseCode}` : '')}
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-8">
        {/* Desktop Top Navy Bar (Ref 13) */}
        <header className="hidden lg:flex lg:h-14 lg:items-center lg:justify-between lg:bg-brand-blue lg:px-6 lg:text-white">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-white">{schoolName}</span>
            {udiseCode && (
              <span className="text-xs text-white/75">· UDISE {udiseCode}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle onBrandBlue />
            <LogoutButton label={logoutLabel} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[360px] flex-1 space-y-4 p-3.5 lg:max-w-5xl lg:space-y-6 lg:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 lg:text-xl">
                {showImport ? t('importHeading') : t('title')}
              </h1>
              {showImport && (
                <p className="text-xs text-slate-500">
                  {t('importSubheading')}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {showImport ? (
                <>
                  <a
                    href={`/api/schools/${schoolId}/students/template?locale=${locale}`}
                    download
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t('downloadTemplate')}
                  </a>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowImport(false)}
                    className="h-9 text-xs font-semibold"
                  >
                    {t('title')}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={openAddForm}
                    className="h-9 bg-brand-blue text-xs font-bold text-white"
                  >
                    + {t('addStudent')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowImport(true);
                      setImportReport(null);
                    }}
                    className="h-9 gap-1.5 text-xs font-bold"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {t('importCsv')}
                  </Button>
                </>
              )}
            </div>
          </div>

          {errorMsg && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
            >
              {errorMsg}
            </p>
          )}

          {/* Ref 13: 3-Step Import View */}
          {showImport && (
            <div className="space-y-5">
              {/* 3-Step Indicator */}
              <div className="flex items-center gap-2 text-xs font-bold">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                      currentStep > 1
                        ? 'bg-[#059669] text-white'
                        : 'bg-brand-blue text-white'
                    }`}
                  >
                    {currentStep > 1 ? (
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    ) : (
                      '1'
                    )}
                  </span>
                  <span className="text-slate-900">{t('step1Upload')}</span>
                </div>
                <div className="h-px w-8 bg-slate-300" />
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                      currentStep === 2
                        ? 'bg-brand-blue text-white'
                        : currentStep > 2
                        ? 'bg-[#059669] text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {currentStep > 2 ? (
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    ) : (
                      '2'
                    )}
                  </span>
                  <span
                    className={
                      currentStep >= 2 ? 'text-slate-900' : 'text-slate-400'
                    }
                  >
                    {t('step2CheckColumns')}
                  </span>
                </div>
                <div className="h-px w-8 bg-slate-300" />
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                      currentStep === 3
                        ? 'bg-[#059669] text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    3
                  </span>
                  <span
                    className={
                      currentStep === 3 ? 'text-slate-900' : 'text-slate-400'
                    }
                  >
                    {t('step3Import')}
                  </span>
                </div>
              </div>

              {/* File Upload Card */}
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label
                    htmlFor="importFile"
                    className="text-xs font-bold text-slate-800"
                  >
                    {t('selectFile')}
                  </Label>
                  {selectedFile && (
                    <span className="text-xs font-semibold text-[#059669]">
                      ✓ {selectedFile.name} ({richRows.length} rows)
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="importFile"
                    type="file"
                    accept=".csv,.xlsx"
                    className="h-10 text-xs"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setSelectedFile(file);
                      setPreviewRows([]);
                      setImportReport(null);
                      if (file) {
                        void parseFileLocally(file);
                        void handlePreviewFile(file);
                      }
                    }}
                  />
                  {selectedFile && headers.length === 0 && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handlePreviewFile()}
                      className="h-10 bg-brand-blue text-xs font-bold text-white"
                    >
                      {t('previewBtn')}
                    </Button>
                  )}
                </div>
              </div>

              {/* Step 2: Column Mapping + Preview Table (Ref 13) */}
              {headers.length > 0 && (
                <>
                  {/* Column Mapping Card */}
                  <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs space-y-3">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">
                        {t('mapColumns')}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {t('mapColumnsDesc')}
                      </p>
                    </div>

                    <div className="divide-y divide-slate-100 text-xs">
                      <div className="grid grid-cols-12 pb-2 text-[11px] font-semibold text-slate-500">
                        <div className="col-span-5">
                          {t('yourExcelColumn')}
                        </div>
                        <div className="col-span-4">{t('gatesathiField')}</div>
                        <div className="col-span-3 text-right">Status</div>
                      </div>

                      {(
                        [
                          ['admissionNo', `${t('admissionNo')} (required)`],
                          ['name', `${t('name')} (required)`],
                          ['className', `${t('className')} (required)`],
                          ['section', `${t('section')} (required)`],
                          ['rollNumber', t('rollNumber')],
                          ['fatherName', t('fatherName')],
                          ['fatherPhone', t('fatherPhone')],
                          ['motherName', t('motherName')],
                          ['motherPhone', t('motherPhone')],
                        ] as const
                      ).map(([fieldKey, label]) => {
                        const selectedCol = mapping[fieldKey] ?? '';
                        const hasPhoneWarn =
                          fieldKey === 'fatherPhone' &&
                          invalidFatherPhoneCount > 0;

                        return (
                          <div
                            key={fieldKey}
                            className="grid grid-cols-12 items-center gap-2 py-2.5"
                          >
                            <div className="col-span-5 flex items-center gap-2">
                              <select
                                value={selectedCol}
                                onChange={(e) => {
                                  const updated = {
                                    ...mapping,
                                    [fieldKey]: e.target.value,
                                  };
                                  setMapping(updated);
                                  void handlePreviewFile(undefined, updated);
                                }}
                                className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800"
                              >
                                <option value="">--</option>
                                {headers.map((h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                              <ArrowRight className="hidden sm:block h-3.5 w-3.5 shrink-0 text-slate-400" />
                            </div>

                            <div className="col-span-4 font-semibold text-slate-800">
                              {label}
                            </div>

                            <div className="col-span-3 flex justify-end">
                              {hasPhoneWarn ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFBEB] px-2.5 py-0.5 text-[11px] font-bold text-amber-800 border border-[#F59E0B]/40">
                                  ⚠{' '}
                                  {t('checkInvalidBadge', {
                                    count: invalidFatherPhoneCount,
                                  })}
                                </span>
                              ) : selectedCol ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-[#059669]">
                                  ✓ {t('matchedBadge')}
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400">
                                  —
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Preview Table Card (first 6 rows, invalid highlighted in red) */}
                  <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs space-y-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-sm font-extrabold text-slate-900">
                        {t('previewFirstRows', { count: richRows.length })}
                      </h3>
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <span className="text-[#059669]">
                          ✓ {t('summaryReady', { count: readyCount })}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-amber-700">
                          ⚠ {t('summaryNeedFixing', { count: needFixingCount })}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-red-600">
                          ✕ {t('summaryDuplicates', { count: duplicateCount })}
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="p-2.5 font-semibold">Row</th>
                            <th className="p-2.5 font-semibold">
                              {t('admissionNo')}
                            </th>
                            <th className="p-2.5 font-semibold">{t('name')}</th>
                            <th className="p-2.5 font-semibold">
                              {t('className')}
                            </th>
                            <th className="p-2.5 font-semibold">
                              {t('section')}
                            </th>
                            <th className="p-2.5 font-semibold">
                              {t('fatherPhone')}
                            </th>
                            <th className="p-2.5 font-semibold">
                              {t('motherPhone')}
                            </th>
                            <th className="p-2.5 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {richRows.slice(0, 6).map((r) => {
                            const hasErr = r.errors.length > 0;
                            return (
                              <tr
                                key={r.rowNumber}
                                className={
                                  hasErr ? 'bg-[#FEF2F2]' : 'bg-white'
                                }
                              >
                                <td className="p-2.5 font-medium text-slate-600">
                                  {r.rowNumber}
                                </td>
                                <td className="p-2.5 font-mono text-slate-800">
                                  {r.admissionNo}
                                </td>
                                <td className="p-2.5 font-bold text-slate-900">
                                  {r.name}
                                </td>
                                <td className="p-2.5 text-slate-700">
                                  {r.className}
                                </td>
                                <td className="p-2.5 text-slate-700">
                                  {r.section}
                                </td>
                                <td
                                  className={`p-2.5 font-mono ${
                                    r.fatherPhone &&
                                    !TEN_DIGIT_PHONE.test(r.fatherPhone)
                                      ? 'font-bold text-[#DC2626]'
                                      : 'text-slate-700'
                                  }`}
                                >
                                  {r.fatherPhone || '—'}
                                </td>
                                <td className="p-2.5 font-mono text-slate-700">
                                  {r.motherPhone || '—'}
                                </td>
                                <td className="p-2.5">
                                  {hasErr ? (
                                    <span className="inline-flex items-center gap-1 font-bold text-[#DC2626]">
                                      ✕ {r.errors[0]}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 font-bold text-[#059669]">
                                      ✓ Ready
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-col justify-between gap-2 pt-2 sm:flex-row sm:items-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadPreImportErrors}
                        className="h-10 text-xs font-semibold"
                      >
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        {t('downloadReportCsv')}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        disabled={importing}
                        onClick={() => void handleRunImport()}
                        className="h-10 rounded-lg bg-[#059669] px-5 text-xs font-extrabold text-white hover:bg-[#047857]"
                      >
                        {importing
                          ? '...'
                          : t('importStudentsCountBtn', {
                              count: readyCount || richRows.length,
                            })}
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {importReport && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 space-y-3 text-xs">
                  <p className="font-extrabold text-emerald-950">
                    ✓ {t('reportHeading')}
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-white p-2.5">
                      <span className="block text-lg font-extrabold text-[#059669]">
                        {importReport.created}
                      </span>
                      <span className="text-slate-600">{t('created')}</span>
                    </div>
                    <div className="rounded-lg bg-white p-2.5">
                      <span className="block text-lg font-extrabold text-brand-blue">
                        {importReport.updated}
                      </span>
                      <span className="text-slate-600">{t('updated')}</span>
                    </div>
                    <div className="rounded-lg bg-white p-2.5">
                      <span className="block text-lg font-extrabold text-[#DC2626]">
                        {importReport.failed}
                      </span>
                      <span className="text-slate-600">{t('failed')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add / Edit Student Form */}
          {showForm && (
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingStudent ? t('editStudent') : t('addStudent')}
              </h3>
              <form
                onSubmit={handleSaveStudent}
                className="space-y-3 text-xs"
              >
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="admissionNo" className="text-xs">
                      {t('admissionNo')}
                    </Label>
                    <Input
                      id="admissionNo"
                      value={formAdmissionNo}
                      onChange={(e) => setFormAdmissionNo(e.target.value)}
                      required
                      className="h-9 text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="studentName" className="text-xs">
                      {t('name')}
                    </Label>
                    <Input
                      id="studentName"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      required
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="className" className="text-xs">
                      {t('className')}
                    </Label>
                    <Input
                      id="className"
                      value={formClass}
                      onChange={(e) => setFormClass(e.target.value)}
                      required
                      className="h-9 text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="section" className="text-xs">
                      {t('section')}
                    </Label>
                    <Input
                      id="section"
                      value={formSection}
                      onChange={(e) => setFormSection(e.target.value)}
                      required
                      className="h-9 text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="rollNumber" className="text-xs">
                      {t('rollNumber')}
                    </Label>
                    <Input
                      id="rollNumber"
                      value={formRollNumber}
                      onChange={(e) => setFormRollNumber(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    type="submit"
                    size="sm"
                    className="bg-brand-blue text-xs font-bold text-white"
                  >
                    {t('save')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                    className="text-xs"
                  >
                    {t('cancel')}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Student List & Filters when not in full-page import view */}
          {!showImport && (
            <>
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-3.5 shadow-2xs space-y-2.5 text-xs">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Input
                    placeholder={t('searchPlaceholder')}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(1);
                    }}
                    className="h-9 text-xs"
                  />
                  <Input
                    placeholder={t('classFilter')}
                    value={classNameFilter}
                    onChange={(e) => {
                      setClassNameFilter(e.target.value);
                      setPage(1);
                    }}
                    className="h-9 text-xs"
                  />
                  <Input
                    placeholder={t('sectionFilter')}
                    value={sectionFilter}
                    onChange={(e) => {
                      setSectionFilter(e.target.value);
                      setPage(1);
                    }}
                    className="h-9 text-xs"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={includeInactive}
                    onChange={(e) => {
                      setIncludeInactive(e.target.checked);
                      setPage(1);
                    }}
                  />
                  {t('includeInactive')}
                </label>
              </div>

              <div className="space-y-2.5">
                {students.length === 0 && (
                  <div className="rounded-xl border border-[#E2E8F0] bg-white py-8 text-center text-xs text-slate-500">
                    {t('noStudents')}
                  </div>
                )}

                {students.map((s) => (
                  <div
                    key={s._id}
                    className="flex flex-col justify-between gap-2.5 rounded-xl border border-[#E2E8F0] bg-white p-3.5 text-xs shadow-2xs sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{s.name}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            s.isActive
                              ? 'bg-emerald-100 text-[#059669]'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {s.isActive ? t('active') : t('inactive')}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-600">
                        {s.admissionNo} · {t('className')} {s.className}-
                        {s.section}
                        {s.rollNumber ? ` · #${s.rollNumber}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/students/${s._id}?schoolId=${schoolId}`}
                        className="inline-flex h-8 items-center justify-center rounded-lg bg-brand-blue px-3 text-[11px] font-bold text-white hover:bg-brand-blue/90"
                      >
                        {t('viewGuardians')}
                      </Link>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openEditForm(s)}
                        className="h-8 text-xs"
                      >
                        {t('editStudent')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleToggleActive(s)}
                        className="h-8 text-xs"
                      >
                        {s.isActive ? t('deactivate') : t('activate')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1 text-xs">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('prev')}
                </Button>
                <span className="text-slate-600">
                  {t('page')} {page} {t('of')} {totalPages}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('next')}
                </Button>
              </div>
            </>
          )}
        </main>

        {/* Mobile Bottom Navigation Bar (<1024px) */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-14 items-center justify-around border-t border-[#E2E8F0] bg-white lg:hidden">
          <Link
            href="/dashboard"
            className="flex flex-col items-center gap-0.5 text-[11px] font-bold text-slate-400 hover:text-brand-blue"
          >
            <Home className="h-4 w-4" />
            <span>{tDash('navHome')}</span>
          </Link>

          <Link
            href="/students"
            className="flex flex-col items-center gap-0.5 text-[11px] font-bold text-brand-blue"
          >
            <GraduationCap className="h-4 w-4" />
            <span>{tDash('navStudents')}</span>
          </Link>

          <Link
            href="/dashboard?tab=teachers"
            className="flex flex-col items-center gap-0.5 text-[11px] font-bold text-slate-400 hover:text-brand-blue"
          >
            <Users className="h-4 w-4" />
            <span>{tDash('navTeachers')}</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}
