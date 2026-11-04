'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  classAssignments: Array<{ className: string; section: string }>;
}

export function DashboardClient({ schoolId }: { schoolId: string }) {
  const [activeTab, setActiveTab] = useState<'escalated' | 'teachers'>('escalated');

  // Escalated requests
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
  const [importSummary, setImportSummary] = useState<any>(null);

  // General messages
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    if (!schoolId) return;
    try {
      const res = await fetch(`/api/schools/${schoolId}/approvals`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch {
      // ignore poll error
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

  // Polling for requests
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/schools/${schoolId}/approvals`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setRequests(data.requests || []);
        }
      } catch {
        // ignore poll error
      } finally {
        if (!cancelled) setRequestsLoading(false);
      }
    };

    run();
    const interval = setInterval(run, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [schoolId]);

  useEffect(() => {
    if (activeTab !== 'teachers' || !schoolId) return;
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

    run();
  }, [activeTab, schoolId]);

  const handleDecision = async (
    requestId: string,
    decision: 'approve' | 'reject'
  ) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (decision === 'reject') {
      if (!rejectNote.trim() || rejectNote.trim().length < 3) {
        setErrorMsg('अस्वीकार करने के लिए कारण (टिप्पणी) अनिवार्य है।');
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
        setErrorMsg(data.error || 'त्रुटि हुई');
        return;
      }

      setSuccessMsg(
        decision === 'approve'
          ? 'प्रधानाचार्य द्वारा अनुरोध स्वीकृत किया गया।'
          : 'प्रधानाचार्य द्वारा अनुरोध अस्वीकार किया गया।'
      );
      setRejectingId(null);
      setRejectNote('');
      await fetchApprovals();
    } catch {
      setErrorMsg('नेटवर्क त्रुटि');
    } finally {
      setProcessingId(null);
    }
  };

  const handleAddTeacher = async (resolution?: 'use_existing' | 'update_name') => {
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
            { className: teacherClass.trim(), section: teacherSection.trim().toUpperCase() },
          ],
          resolution,
        }),
      });

      const data = await res.json();
      if (res.status === 409 && data.conflict) {
        if (
          confirm(
            `इस फोन नंबर (${data.conflict.phone}) से पहले ही "${data.conflict.existingName}" पंजीकृत हैं। क्या आप मौजूदा नाम रखना चाहते हैं? (OK = Keep Existing, Cancel = Update to New Name)`
          )
        ) {
          await handleAddTeacher('use_existing');
        } else {
          await handleAddTeacher('update_name');
        }
        return;
      }

      if (!res.ok) {
        setErrorMsg(data.error || 'शिक्षक जोड़ने में त्रुटि हुई');
        return;
      }

      setSuccessMsg(`शिक्षक "${teacherName}" सफलतापूर्वक जोड़े गए!`);
      setShowAddTeacher(false);
      setTeacherName('');
      setTeacherPhone('');
      await fetchTeachers();
    } catch {
      setErrorMsg('नेटवर्क त्रुटि');
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
      setErrorMsg('स्थिति बदलने में त्रुटि हुई');
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
        setErrorMsg(data.error || 'आयात विफल रहा');
        return;
      }
      setImportSummary(data);
      setSuccessMsg(`सफलतापूर्वक आयातित: ${data.created} नए, ${data.updated} अपडेटेड`);
      await fetchTeachers();
    } catch {
      setErrorMsg('फ़ाइल आयात में नेटवर्क त्रुटि');
    } finally {
      setImporting(false);
    }
  };

  const escalatedList = requests.filter((r) => r.status === 'escalated');
  const pendingList = requests.filter((r) => r.status === 'pending');

  return (
    <div className="space-y-4">
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

      {/* Main Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('escalated')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
            activeTab === 'escalated'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>एस्केलेटेड व मंज़ूरी अनुरोध</span>
          {escalatedList.length > 0 ? (
            <span className="flex h-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white animate-pulse">
              {escalatedList.length} एस्केलेटेड
            </span>
          ) : requests.length > 0 ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
              {requests.length}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('teachers')}
          className={`border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
            activeTab === 'teachers'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          शिक्षक प्रबंधन (Teachers)
        </button>
      </div>

      {activeTab === 'escalated' ? (
        <div className="space-y-3">
          {requestsLoading ? (
            <div className="py-8 text-center text-xs text-slate-500">
              लोड हो रहा है...
            </div>
          ) : requests.length === 0 ? (
            <Card className="text-center py-8">
              <CardContent>
                <p className="text-xs text-slate-500">
                  वर्तमान में कोई लंबित या एस्केलेटेड अनुरोध नहीं है।
                </p>
              </CardContent>
            </Card>
          ) : (
            requests.map((req) => {
              const isEscalated = req.status === 'escalated';
              const isProcessing = processingId === req._id;
              const isRejecting = rejectingId === req._id;

              return (
                <Card
                  key={req._id}
                  className={`overflow-hidden border-2 ${
                    isEscalated
                      ? 'border-red-500 bg-red-50/20'
                      : 'border-amber-300 bg-amber-50/20'
                  }`}
                >
                  <CardHeader className="p-3 pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isEscalated ? (
                        <span className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider animate-pulse">
                          एस्केलेटेड (प्रधानाचार्य निर्णय अपेक्षित)
                        </span>
                      ) : (
                        <span className="rounded bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                          लंबित (शिक्षक: {req.teacherName || 'उपलब्ध नहीं'})
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 space-y-3">
                    <div className="flex gap-3">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                        {req.visitor?.signedPhotoUrl ? (
                          <Image
                            src={req.visitor.signedPhotoUrl}
                            alt={req.visitor.name || 'Visitor'}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xl text-slate-400">
                            👤
                          </div>
                        )}
                      </div>
                      <div className="text-xs space-y-0.5 flex-1 min-w-0">
                        <p className="font-bold text-slate-900 truncate">
                          आगंतुक: {req.visitor?.name} ({req.visitor?.phone})
                        </p>
                        <p className="text-slate-600">
                          संबंध: {req.visitor?.defaultRelation || 'अभिभावक'}
                        </p>
                        <p className="font-semibold text-brand-blue truncate">
                          छात्र: {req.student?.name} (कक्षा {req.student?.className}-
                          {req.student?.section})
                        </p>
                      </div>
                    </div>

                    {isRejecting ? (
                      <div className="space-y-2 rounded border border-red-200 bg-red-50 p-2 text-xs">
                        <Label className="font-bold text-red-900">
                          अस्वीकार का कारण (अनिवार्य):
                        </Label>
                        <Input
                          placeholder="उदा. अनाधिकृत व्यक्ति / फोन पर अनुमति नहीं दी"
                          value={rejectNote}
                          onChange={(e) => setRejectNote(e.target.value)}
                          className="h-8 text-xs bg-white"
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
                            className="h-7 text-xs"
                          >
                            रद्द करें
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={isProcessing}
                            onClick={() => handleDecision(req._id, 'reject')}
                            className="h-7 text-xs"
                          >
                            अस्वीकार करें
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={isProcessing}
                          onClick={() => handleDecision(req._id, 'approve')}
                          className="h-8 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white"
                        >
                          ✓ मंज़ूरी दें (Approve)
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
                          className="h-8 border-red-300 text-red-700 hover:bg-red-50 text-xs font-bold"
                        >
                          ✕ अस्वीकार (Reject)
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        /* Teachers Management Tab */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              विद्यालय के शिक्षक सूची ({teachers.length})
            </h3>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowImportTeachers((v) => !v)}
                className="h-8 text-xs"
              >
                CSV आयात
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setShowAddTeacher((v) => !v)}
                className="h-8 text-xs bg-brand-blue"
              >
                + शिक्षक जोड़ें
              </Button>
            </div>
          </div>

          {/* Add Teacher Card */}
          {showAddTeacher && (
            <Card className="border border-blue-200 bg-blue-50/40 p-3">
              <CardTitle className="text-xs font-bold text-brand-blue mb-2">
                नया शिक्षक जोड़ें
              </CardTitle>
              <div className="space-y-2 text-xs">
                <div>
                  <Label htmlFor="tName">शिक्षक का नाम</Label>
                  <Input
                    id="tName"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    placeholder="उदा. सुनीता शर्मा"
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div>
                  <Label htmlFor="tPhone">10 अंकों का मोबाइल नंबर</Label>
                  <Input
                    id="tPhone"
                    type="tel"
                    maxLength={10}
                    value={teacherPhone}
                    onChange={(e) =>
                      setTeacherPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
                    }
                    placeholder="9876543210"
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="tClass">कक्षा</Label>
                    <Input
                      id="tClass"
                      value={teacherClass}
                      onChange={(e) => setTeacherClass(e.target.value)}
                      placeholder="5"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor="tSection">सेक्शन</Label>
                    <Input
                      id="tSection"
                      value={teacherSection}
                      onChange={(e) => setTeacherSection(e.target.value.toUpperCase())}
                      placeholder="A"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddTeacher(false)}
                    className="h-8 text-xs"
                  >
                    रद्द करें
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
                    onClick={() => handleAddTeacher()}
                    className="h-8 text-xs bg-brand-blue"
                  >
                    {savingTeacher ? 'सहेजा जा रहा है...' : 'सहेजें'}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Import CSV Card */}
          {showImportTeachers && (
            <Card className="border border-slate-200 p-3">
              <form onSubmit={handleImportTeachers} className="space-y-3 text-xs">
                <CardTitle className="text-xs font-bold text-slate-900">
                  शिक्षक CSV / Excel फ़ाइल आयात करें
                </CardTitle>
                <p className="text-[11px] text-slate-500">
                  फ़ाइल में कॉलम होने चाहिए: <code>name, phone, className, section</code>
                </p>
                <Input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="h-9 text-xs"
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowImportTeachers(false)}
                    className="h-8 text-xs"
                  >
                    बंद करें
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={importing || !importFile}
                    className="h-8 text-xs bg-brand-blue"
                  >
                    {importing ? 'आयात हो रहा है...' : 'फ़ाइल अपलोड व आयात'}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Teachers List */}
          {teachersLoading ? (
            <div className="py-6 text-center text-xs text-slate-500">
              शिक्षक सूची लोड हो रही है...
            </div>
          ) : teachers.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              इस विद्यालय में कोई शिक्षक पंजीकृत नहीं है।
            </div>
          ) : (
            <div className="space-y-2">
              {teachers.map((t) => (
                <Card key={t._id} className="p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900">
                        {t.name}{' '}
                        <span className="font-normal text-slate-500">({t.phone})</span>
                      </h4>
                      <p className="text-slate-600 mt-0.5">
                        कक्षा आवंटन:{' '}
                        {t.classAssignments && t.classAssignments.length > 0
                          ? t.classAssignments
                              .map((a) => `${a.className}-${a.section}`)
                              .join(', ')
                          : 'कोई कक्षा आवंटित नहीं'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={t.isActive ? 'outline' : 'default'}
                      onClick={() => handleToggleTeacherActive(t)}
                      className={`h-7 text-[11px] ${
                        t.isActive
                          ? 'border-red-300 text-red-700 hover:bg-red-50'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {t.isActive ? 'निष्क्रिय करें' : 'सक्रिय करें'}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Navigation Footer */}
      <div className="pt-2">
        <Link
          href="/students"
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand-blue px-4 text-xs font-bold text-white shadow hover:bg-brand-blue/90"
        >
          छात्र डेटाबेस व अभिभावक सूची (Manage Students)
        </Link>
      </div>
    </div>
  );
}
