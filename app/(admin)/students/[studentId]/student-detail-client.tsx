'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GUARDIAN_RELATIONS, type GuardianRelation } from '@/models/GuardianLink';
import type { StudentListItem } from '../students-client';

interface GuardianItem {
  guardianLinkId: string;
  visitorId: string;
  name: string;
  phone: string;
  photoKey: string | null;
  relation: GuardianRelation;
  approved: boolean;
}

interface ExistingVisitorConflict {
  visitorId: string;
  name: string;
  phone: string;
  relations: GuardianRelation[];
  linkedStudents: Array<{
    studentId: string;
    name: string;
    admissionNo: string;
    className: string;
    section: string;
    relation: GuardianRelation;
  }>;
}

export function StudentDetailClient({
  schoolId,
  studentId,
}: {
  schoolId: string;
  studentId: string;
}) {
  const t = useTranslations('guardians');
  const tStudent = useTranslations('students');

  const [student, setStudent] = useState<StudentListItem | null>(null);
  const [guardians, setGuardians] = useState<GuardianItem[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState<GuardianRelation>('Father');
  const [conflict, setConflict] = useState<ExistingVisitorConflict | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/schools/${schoolId}/students/${studentId}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setErrorMsg(data.error ?? 'Failed to load student details');
          return;
        }
        setErrorMsg(null);
        setStudent(data.student);
        setGuardians(data.guardians ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMsg('Failed to load student details');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [schoolId, studentId, refreshKey]);

  const submitGuardian = async (
    conflictResolution?: 'use_existing' | 'update_name'
  ) => {
    setErrorMsg(null);

    const res = await fetch(
      `/api/schools/${schoolId}/students/${studentId}/guardians`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          relation,
          ...(conflictResolution ? { conflictResolution } : {}),
        }),
      }
    );

    const data = await res.json();
    if (res.status === 409 && data.existingVisitor) {
      setConflict(data.existingVisitor);
      return;
    }

    if (!res.ok) {
      setErrorMsg(data.error ?? 'Failed to add guardian');
      return;
    }

    setConflict(null);
    setName('');
    setPhone('');
    setRelation('Father');
    setRefreshKey((k) => k + 1);
  };

  const handleAddGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitGuardian();
  };

  const handleRemoveGuardian = async (guardianLinkId: string) => {
    setErrorMsg(null);
    const res = await fetch(
      `/api/schools/${schoolId}/students/${studentId}/guardians?guardianLinkId=${guardianLinkId}`,
      {
        method: 'DELETE',
      }
    );
    if (res.ok) {
      setRefreshKey((k) => k + 1);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">
          {t('studentDetails')}
        </h2>
        <Link
          href="/students"
          className="text-xs font-medium text-slate-600 underline"
        >
          {t('backToStudents')}
        </Link>
      </div>

      {student && (
        <Card>
          <CardContent className="space-y-1 p-4 text-xs">
            <p className="text-sm font-bold text-slate-900">{student.name}</p>
            <p className="font-mono text-slate-600">
              {tStudent('admissionNo')}: {student.admissionNo}
            </p>
            <p className="text-slate-600">
              {tStudent('className')}: {student.className}-{student.section}
              {student.rollNumber ? ` · #${student.rollNumber}` : ''}
            </p>
          </CardContent>
        </Card>
      )}

      {errorMsg && (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {errorMsg}
        </p>
      )}

      {/* Approved Guardians List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('approvedGuardians')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 text-xs">
          {guardians.length === 0 ? (
            <p className="text-slate-500">{t('noGuardians')}</p>
          ) : (
            guardians.map((g) => (
              <div
                key={g.guardianLinkId}
                className="flex items-center justify-between rounded border border-slate-200 p-2.5"
              >
                <div className="space-y-0.5">
                  <p className="font-semibold text-slate-900">{g.name}</p>
                  <p className="text-[11px] text-slate-600">
                    {t(`relations.${g.relation}`)} · {g.phone}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRemoveGuardian(g.guardianLinkId)}
                >
                  {t('remove')}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Add Guardian Form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('addGuardian')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleAddGuardian} className="space-y-2.5 text-xs">
            <div>
              <Label htmlFor="guardianName" className="text-xs">
                {t('name')}
              </Label>
              <Input
                id="guardianName"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setConflict(null);
                }}
                required
                className="h-9 text-xs"
              />
            </div>

            <div>
              <Label htmlFor="guardianPhone" className="text-xs">
                {t('phone')}
              </Label>
              <Input
                id="guardianPhone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setConflict(null);
                }}
                required
                className="h-9 text-xs"
              />
            </div>

            <div>
              <Label htmlFor="guardianRelation" className="text-xs">
                {t('relation')}
              </Label>
              <select
                id="guardianRelation"
                value={relation}
                onChange={(e) => setRelation(e.target.value as GuardianRelation)}
                className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs"
              >
                {GUARDIAN_RELATIONS.map((rel) => (
                  <option key={rel} value={rel}>
                    {t(`relations.${rel}`)}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" size="sm" className="w-full">
              {t('addGuardian')}
            </Button>
          </form>

          {conflict && (
            <div
              role="alert"
              className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"
            >
              <p className="font-semibold">
                {t('phoneBelongsTo', { name: conflict.name })}
              </p>
              {conflict.linkedStudents.length > 0 && (
                <ul className="list-disc pl-4 text-[11px] text-amber-900">
                  {conflict.linkedStudents.map((ls) => (
                    <li key={`${ls.studentId}-${ls.relation}`}>
                      {ls.name} ({ls.admissionNo}) — {t(`relations.${ls.relation}`)}
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void submitGuardian('use_existing')}
                >
                  {t('useThisPerson')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void submitGuardian('update_name')}
                >
                  {t('updateName')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
