'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export function StudentsClient({ schoolId }: { schoolId: string }) {
  const t = useTranslations('students');
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
  const [editingStudent, setEditingStudent] = useState<StudentListItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formAdmissionNo, setFormAdmissionNo] = useState('');
  const [formName, setFormName] = useState('');
  const [formClass, setFormClass] = useState('');
  const [formSection, setFormSection] = useState('A');
  const [formRollNumber, setFormRollNumber] = useState('');

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
  const [importReport, setImportReport] = useState<ImportExecutionSummary | null>(
    null
  );

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
  }, [schoolId, q, classNameFilter, sectionFilter, includeInactive, page, refreshKey]);

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

  const handlePreviewFile = async (customMap?: Partial<ColumnMapping>) => {
    if (!selectedFile) return;
    setErrorMsg(null);
    const fd = new FormData();
    fd.append('file', selectedFile);
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
    setErrorMsg(null);
    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('mode', 'commit');
    fd.append('mapping', JSON.stringify(mapping));

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
  };

  const handleDownloadReportCsv = () => {
    if (!importReport?.reportCsv) return;
    const blob = new Blob([importReport.reportCsv], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student-import-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">{t('title')}</h2>
        <Link
          href="/dashboard"
          className="text-xs font-medium text-slate-600 underline"
        >
          {t('backToDashboard')}
        </Link>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size="sm" onClick={openAddForm}>
          {t('addStudent')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setShowImport((v) => !v);
            setImportReport(null);
          }}
        >
          {t('importCsv')}
        </Button>
      </div>

      {/* CSV/Excel Import Panel */}
      {showImport && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{t('importHeading')}</CardTitle>
              <a
                href={`/api/schools/${schoolId}/students/template?locale=${locale}`}
                download
                className="text-xs font-medium text-indigo-700 underline"
              >
                {t('downloadTemplate')}
              </a>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label htmlFor="importFile" className="text-xs">
                {t('selectFile')}
              </Label>
              <Input
                id="importFile"
                type="file"
                accept=".csv,.xlsx"
                className="h-9 text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setSelectedFile(file);
                  setPreviewRows([]);
                  setImportReport(null);
                }}
              />
            </div>

            {selectedFile && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => void handlePreviewFile()}
              >
                {t('previewBtn')}
              </Button>
            )}

            {headers.length > 0 && (
              <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-2.5">
                <p className="font-semibold text-slate-800">{t('mapColumns')}</p>
                {(
                  [
                    ['admissionNo', t('admissionNo')],
                    ['name', t('name')],
                    ['className', t('className')],
                    ['section', t('section')],
                    ['rollNumber', t('rollNumber')],
                    ['fatherName', t('fatherName')],
                    ['fatherPhone', t('fatherPhone')],
                    ['motherName', t('motherName')],
                    ['motherPhone', t('motherPhone')],
                    ['guardianName', t('guardianName')],
                    ['guardianPhone', t('guardianPhone')],
                    ['guardianRelation', t('guardianRelation')],
                  ] as const
                ).map(([fieldKey, label]) => (
                  <div
                    key={fieldKey}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-[11px] text-slate-700">{label}</span>
                    <select
                      value={mapping[fieldKey] ?? ''}
                      onChange={(e) => {
                        const updated = {
                          ...mapping,
                          [fieldKey]: e.target.value,
                        };
                        setMapping(updated);
                        void handlePreviewFile(updated);
                      }}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                    >
                      <option value="">--</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}

                {previewRows.length > 0 && (
                  <div className="max-h-40 overflow-x-auto overflow-y-auto rounded border border-slate-200 bg-white">
                    <table className="w-full text-left text-[10px]">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="p-1">#</th>
                          <th className="p-1">{t('admissionNo')}</th>
                          <th className="p-1">{t('name')}</th>
                          <th className="p-1">{t('className')}</th>
                          <th className="p-1">{t('section')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((r) => (
                          <tr key={r.rowNumber} className="border-t">
                            <td className="p-1">{r.rowNumber}</td>
                            <td className="p-1">{r.admissionNo}</td>
                            <td className="p-1">{r.name}</td>
                            <td className="p-1">{r.className}</td>
                            <td className="p-1">{r.section}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  onClick={() => void handleRunImport()}
                >
                  {t('confirmImport')}
                </Button>
              </div>
            )}

            {importReport && (
              <div className="space-y-2 rounded border border-emerald-200 bg-emerald-50 p-2.5">
                <p className="font-semibold text-emerald-950">
                  {t('reportHeading')}
                </p>
                <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
                  <div className="rounded bg-white p-1.5">
                    <span className="block font-bold text-emerald-700">
                      {importReport.created}
                    </span>
                    <span>{t('created')}</span>
                  </div>
                  <div className="rounded bg-white p-1.5">
                    <span className="block font-bold text-blue-700">
                      {importReport.updated}
                    </span>
                    <span>{t('updated')}</span>
                  </div>
                  <div className="rounded bg-white p-1.5">
                    <span className="block font-bold text-red-700">
                      {importReport.failed}
                    </span>
                    <span>{t('failed')}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                  <div className="rounded bg-white p-1.5">
                    <span className="block font-bold text-emerald-700">
                      {importReport.guardiansCreated}
                    </span>
                    <span>{t('guardiansCreated')}</span>
                  </div>
                  <div className="rounded bg-white p-1.5">
                    <span className="block font-bold text-indigo-700">
                      {importReport.guardiansLinked}
                    </span>
                    <span>{t('guardiansLinked')}</span>
                  </div>
                  <div className="rounded bg-white p-1.5">
                    <span className="block font-bold text-amber-700">
                      {importReport.guardianConflicts}
                    </span>
                    <span>{t('guardianConflicts')}</span>
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={handleDownloadReportCsv}
                >
                  {t('downloadReportCsv')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Student Form */}
      {showForm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {editingStudent ? t('editStudent') : t('addStudent')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveStudent} className="space-y-2.5 text-xs">
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
                <Button type="submit" size="sm" className="flex-1">
                  {t('save')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  {t('cancel')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Search & Filters */}
      <Card>
        <CardContent className="space-y-2.5 pt-4 text-xs">
          <Input
            placeholder={t('searchPlaceholder')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="h-9 text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder={t('classFilter')}
              value={classNameFilter}
              onChange={(e) => {
                setClassNameFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 text-xs"
            />
            <Input
              placeholder={t('sectionFilter')}
              value={sectionFilter}
              onChange={(e) => {
                setSectionFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 text-xs"
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
        </CardContent>
      </Card>

      {errorMsg && (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {errorMsg}
        </p>
      )}

      {/* Student List */}
      <div className="space-y-2">
        {students.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-500">
            {t('noStudents')}
          </p>
        )}

        {students.map((s) => (
          <Card key={s._id}>
            <CardContent className="space-y-2 p-3.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{s.name}</p>
                  <p className="font-mono text-[11px] text-slate-600">
                    {s.admissionNo} · {t('className')} {s.className}-{s.section}
                    {s.rollNumber ? ` · #${s.rollNumber}` : ''}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    s.isActive
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {s.isActive ? t('active') : t('inactive')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <Link
                  href={`/students/${s._id}?schoolId=${schoolId}`}
                  className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-brand-blue px-2.5 text-[11px] font-medium text-white hover:bg-brand-blue/90"
                >
                  {t('viewGuardians')}
                </Link>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openEditForm(s)}
                >
                  {t('editStudent')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleToggleActive(s)}
                >
                  {s.isActive ? t('deactivate') : t('activate')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pagination */}
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
    </div>
  );
}
