'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Users,
  Clock,
  ShieldCheck,
  Search,
  Download,
  Smartphone,
  Laptop,
  ArrowRight,
  RefreshCw,
  Camera,
} from 'lucide-react';

interface DemoShowcaseProps {
  initialTab?: 'mobile' | 'admin';
  locale?: 'hi' | 'en';
  standalone?: boolean;
}

export function DemoShowcase({
  initialTab = 'mobile',
  locale = 'hi',
  standalone = false,
}: DemoShowcaseProps) {
  const isHi = locale === 'hi';
  const [activeTab, setActiveTab] = useState<'mobile' | 'admin'>(initialTab);
  const [visitorType, setVisitorType] = useState<'approved' | 'unapproved'>('approved');
  
  // Interactive admin visitor list
  const [activeVisitors, setActiveVisitors] = useState([
    {
      id: 'v1',
      name: isHi ? 'सुनील कुमार (Sunil Kumar)' : 'Sunil Kumar',
      relation: isHi ? 'पिता (Father)' : 'Father',
      student: isHi ? 'आरव कुमार (कक्षा 5-A, रोल 101)' : 'Aarav Kumar (Class 5-A, Roll 101)',
      time: '10:15 AM',
      isApproved: true,
      reason: isHi ? 'अभिभावक बैठक' : 'Parent Meeting',
      phone: '98100 00001',
    },
    {
      id: 'v2',
      name: isHi ? 'रेखा देवी (Rekha Devi)' : 'Rekha Devi',
      relation: isHi ? 'माता (Mother)' : 'Mother',
      student: isHi ? 'प्रिया शर्मा (कक्षा 5-A, रोल 102)' : 'Priya Sharma (Class 5-A, Roll 102)',
      time: '09:50 AM',
      isApproved: true,
      reason: isHi ? 'दवा व भोजन देने' : 'Medicine & Tiffin',
      phone: '98100 00002',
    },
    {
      id: 'v3',
      name: isHi ? 'अमित वर्मा (Amit Verma - वेंडर)' : 'Amit Verma (Vendor)',
      relation: isHi ? 'प्लंबर / मेंटेनेंस' : 'Plumber / Maintenance',
      student: isHi ? 'विद्यालय प्रशासन' : 'School Admin Office',
      time: '09:30 AM',
      isApproved: false,
      reason: isHi ? 'पानी की टंकी मरम्मत (अनधिकृत आगंतुक)' : 'Water tank repair (Unapproved Visitor)',
      phone: '98100 00099',
    },
  ]);

  const handleMarkExit = (id: string) => {
    setActiveVisitors((prev) => prev.filter((v) => v.id !== id));
  };

  const handleResetVisitors = () => {
    setActiveVisitors([
      {
        id: 'v1',
        name: isHi ? 'सुनील कुमार (Sunil Kumar)' : 'Sunil Kumar',
        relation: isHi ? 'पिता (Father)' : 'Father',
        student: isHi ? 'आरव कुमार (कक्षा 5-A, रोल 101)' : 'Aarav Kumar (Class 5-A, Roll 101)',
        time: '10:15 AM',
        isApproved: true,
        reason: isHi ? 'अभिभावक बैठक' : 'Parent Meeting',
        phone: '98100 00001',
      },
      {
        id: 'v2',
        name: isHi ? 'रेखा देवी (Rekha Devi)' : 'Rekha Devi',
        relation: isHi ? 'माता (Mother)' : 'Mother',
        student: isHi ? 'प्रिया शर्मा (कक्षा 5-A, रोल 102)' : 'Priya Sharma (Class 5-A, Roll 102)',
        time: '09:50 AM',
        isApproved: true,
        reason: isHi ? 'दवा व भोजन देने' : 'Medicine & Tiffin',
        phone: '98100 00002',
      },
      {
        id: 'v3',
        name: isHi ? 'अमित वर्मा (Amit Verma - वेंडर)' : 'Amit Verma (Vendor)',
        relation: isHi ? 'प्लंबर / मेंटेनेंस' : 'Plumber / Maintenance',
        student: isHi ? 'विद्यालय प्रशासन' : 'School Admin Office',
        time: '09:30 AM',
        isApproved: false,
        reason: isHi ? 'पानी की टंकी मरम्मत (अनधिकृत आगंतुक)' : 'Water tank repair (Unapproved Visitor)',
        phone: '98100 00099',
      },
    ]);
  };

  return (
    <div className="w-full">
      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center justify-center gap-3 pb-6">
        <button
          type="button"
          onClick={() => setActiveTab('mobile')}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all shadow-sm ${
            activeTab === 'mobile'
              ? 'bg-brand-blue text-white ring-2 ring-brand-blue/30'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Smartphone className="h-4 w-4" />
          <span>{isHi ? '1. मोबाइल फ़ोन डेमो (गार्ड स्क्रीन)' : '1. Mobile Phone Demo (Guard Gate Screen)'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('admin')}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all shadow-sm ${
            activeTab === 'admin'
              ? 'bg-brand-blue text-white ring-2 ring-brand-blue/30'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Laptop className="h-4 w-4" />
          <span>{isHi ? '2. एडमिन डैशबोर्ड डेमो (प्रधानाचार्य दृश्य)' : '2. Admin Dashboard Demo (Principal View)'}</span>
        </button>
      </div>

      {/* VIEW 1: MOBILE PHONE GUARD DEMO */}
      {activeTab === 'mobile' && (
        <div className="mx-auto max-w-sm">
          {/* Interactive controls */}
          <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-100 p-2 text-xs text-slate-700">
            <span className="font-medium text-slate-600">{isHi ? 'विज़िटर प्रकार बदलें:' : 'Toggle Visitor:'}</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setVisitorType('approved')}
                className={`rounded px-2 py-1 font-medium transition ${
                  visitorType === 'approved'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-200'
                }`}
              >
                {isHi ? 'स्वीकृत अभिभावक' : 'Approved Parent'}
              </button>
              <button
                type="button"
                onClick={() => setVisitorType('unapproved')}
                className={`rounded px-2 py-1 font-medium transition ${
                  visitorType === 'unapproved'
                    ? 'bg-amber-600 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-200'
                }`}
              >
                {isHi ? 'अनधिकृत आगंतुक' : 'Unapproved'}
              </button>
            </div>
          </div>

          {/* Phone Frame */}
          <div className="overflow-hidden rounded-[2.5rem] border-[8px] border-slate-900 bg-slate-950 p-2 shadow-2xl">
            {/* Speaker & camera notch */}
            <div className="mx-auto mb-2 h-4 w-32 rounded-full bg-slate-800" />

            {/* Phone Screen Container */}
            <div className="overflow-hidden rounded-[1.8rem] bg-slate-50 text-slate-900 shadow-inner">
              {/* Status bar */}
              <div className="flex items-center justify-between bg-brand-blue px-4 py-1 text-[10px] text-white/90">
                <span>10:15 AM</span>
                <span className="flex items-center gap-1">
                  <span>4G VoLTE</span>
                  <span>94%</span>
                </span>
              </div>

              {/* App Gate Header */}
              <div className="border-b border-brand-blue/30 bg-brand-blue px-3 py-2.5 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white p-1">
                      <Image
                        src="/brand/icon.png"
                        alt="GateSathi"
                        width={24}
                        height={24}
                        className="h-auto w-auto"
                      />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold leading-tight">GateSathi</h3>
                      <p className="text-[9px] text-blue-100">
                        {isHi ? 'राजकीय वरिष्ठ माध्यमिक विद्यालय' : 'Govt. Senior Secondary Campus'}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    {isHi ? 'गेट #1' : 'Gate #1'}
                  </span>
                </div>
              </div>

              {/* Live Gate Entry Form */}
              <div className="space-y-3 p-3 text-xs">
                {/* Visitor Phone Lookup */}
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {isHi ? '1. आगंतुक मोबाइल नंबर' : '1. Visitor Mobile Number'}
                  </span>
                  <div className="mt-1 flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 border border-slate-200">
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {visitorType === 'approved' ? '+91 98100 00001' : '+91 98100 00099'}
                    </span>
                    <span className="flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      <CheckCircle2 className="h-3 w-3" /> OTP 000000
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-600">
                    {visitorType === 'approved'
                      ? (isHi ? 'नाम: सुनील कुमार (Sunil Kumar)' : 'Name: Sunil Kumar')
                      : (isHi ? 'नाम: अमित वर्मा (Amit Verma - प्लंबर)' : 'Name: Amit Verma (Plumber)')}
                  </p>
                </div>

                {/* Linked Student & Guardian Status Badge */}
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {isHi ? '2. छात्र व अभिभावक सत्यापन' : '2. Student & Guardian Verification'}
                  </span>

                  {visitorType === 'approved' ? (
                    <div className="mt-1 space-y-1.5">
                      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2">
                        <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>{isHi ? 'स्वीकृत अभिभावक (Approved Guardian)' : 'Approved Guardian'}</span>
                        </div>
                        <p className="mt-1 text-[11px] font-semibold text-slate-800">
                          {isHi ? 'छात्र: आरव कुमार (कक्षा 5-A, रोल 101)' : 'Student: Aarav Kumar (Class 5-A, Roll 101)'}
                        </p>
                        <p className="text-[10px] text-slate-600">
                          {isHi ? 'संबंध: पिता (रिकॉर्ड में सत्यापित)' : 'Relation: Father (Verified in records)'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 space-y-1.5">
                      <div className="rounded-lg border border-amber-300 bg-amber-50 p-2">
                        <div className="flex items-center gap-1.5 font-bold text-amber-900">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                          <span>{isHi ? 'अनधिकृत आगंतुक (Unapproved Visitor)' : 'Unapproved Visitor'}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-amber-950">
                          {isHi
                            ? 'यह मोबाइल नंबर किसी पंजीकृत छात्र के अभिभावक से मेल नहीं खाता।'
                            : 'This phone is not registered on any approved guardian list.'}
                        </p>
                      </div>
                      <div className="rounded bg-slate-50 p-1.5 border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-700">
                          {isHi ? 'प्रवेश का कारण (अनिवार्य):' : 'Reason for Visit (Required):'}
                        </span>
                        <p className="text-[10px] text-slate-800 italic">
                          {isHi ? '"प्रधानाचार्य कार्यालय में पानी टंकी मरम्मत हेतु"' : '"Water tank repair at admin office"'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Photo Capture Preview */}
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                    <span>{isHi ? '3. गेट पर लाइव फ़ोटो' : '3. Live Photo Capture'}</span>
                    <span className="text-emerald-700">DPDP Encrypted</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 rounded-lg bg-slate-100 p-2 border border-slate-200">
                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-300 overflow-hidden border border-slate-300">
                      <Camera className="h-6 w-6 text-slate-500" />
                      <div className="absolute inset-0 bg-brand-blue/10 flex items-center justify-center">
                        <span className="rounded bg-black/60 px-1 text-[8px] font-bold text-white">LIVE</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-700">
                      <p className="font-semibold">{isHi ? 'फ़ोटो कैप्चर पूर्ण' : 'Live Photo Captured'}</p>
                      <p className="text-slate-500">{isHi ? '10:15 AM · सुरक्षित निजी स्टोरेज' : '10:15 AM · Private Storage'}</p>
                      <p className="text-[9px] text-slate-500">{isHi ? 'कोई फ़ेशियल स्कैन नहीं' : 'No facial scanning'}</p>
                    </div>
                  </div>
                </div>

                {/* Primary Action Button */}
                <button
                  type="button"
                  className="w-full rounded-xl bg-brand-blue py-2.5 text-center text-xs font-bold text-white shadow-md hover:bg-brand-blue/90"
                >
                  {isHi ? 'गेट पास जारी करें (Issue Gate Pass)' : 'Issue Gate Pass'}
                </button>

                {/* Inside Now Footer Link */}
                <div className="text-center pt-1">
                  <span className="text-[10px] font-medium text-slate-500">
                    {isHi ? 'कैंपस में वर्तमान में ' : 'Currently inside: '}
                    <strong className="text-brand-blue">3 {isHi ? 'आगंतुक' : 'visitors'}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: ADMIN DASHBOARD PRINCIPAL DEMO */}
      {activeTab === 'admin' && (
        <div className="mx-auto max-w-4xl">
          {/* Desktop Browser Mockup */}
          <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-xl">
            {/* Browser top chrome */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-amber-400" />
                <div className="h-3 w-3 rounded-full bg-emerald-400" />
              </div>
              <div className="rounded-md bg-white px-6 py-1 text-xs font-mono text-slate-600 border border-slate-200 shadow-sm">
                https://gatesathi.in/dashboard
              </div>
              <div className="text-xs text-slate-500 font-medium">
                {isHi ? 'प्रधानाचार्य पोर्टल' : 'Principal Portal'}
              </div>
            </div>

            {/* Dashboard Content */}
            <div className="p-4 sm:p-6 space-y-6 bg-slate-50">
              {/* Header inside Dashboard */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {isHi ? 'राजकीय वरिष्ठ माध्यमिक विद्यालय (Pilot 001)' : 'Govt. Senior Secondary School (Pilot 001)'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isHi ? 'चिनहट, लखनऊ · UDISE: 09150100101 · लाइव सुरक्षा अवलोकन' : 'Chinhat, Lucknow · UDISE: 09150100101 · Live Safety Console'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetVisitors}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-100"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>{isHi ? 'रीसेट डेटा' : 'Reset List'}</span>
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-blue/90"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{isHi ? 'CSV डाउनलोड' : 'Export CSV'}</span>
                  </button>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-emerald-800">
                      {isHi ? 'अंदर उपस्थित' : 'Inside Campus'}
                    </span>
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
                    </span>
                  </div>
                  <p className="mt-1 text-2xl font-black text-emerald-900">{activeVisitors.length}</p>
                  <p className="text-[10px] text-emerald-700">{isHi ? 'लाइव आगंतुक' : 'Active visitors'}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                  <span className="text-xs font-medium text-slate-600">
                    {isHi ? 'आज के कुल प्रवेश' : 'Total Entries Today'}
                  </span>
                  <p className="mt-1 text-2xl font-black text-slate-900">24</p>
                  <p className="text-[10px] text-slate-500">{isHi ? 'गेट #1 से' : 'via Gate #1'}</p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-amber-800">
                      {isHi ? 'अनधिकृत आगंतुक' : 'Unapproved'}
                    </span>
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                  <p className="mt-1 text-2xl font-black text-amber-900">1</p>
                  <p className="text-[10px] text-amber-705">{isHi ? 'कारण सहित दर्ज' : 'Logged with reason'}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">
                      {isHi ? 'औसत अवधि' : 'Avg Duration'}
                    </span>
                    <Clock className="h-4 w-4 text-slate-500" />
                  </div>
                  <p className="mt-1 text-2xl font-black text-slate-900">18m</p>
                  <p className="text-[10px] text-slate-500">{isHi ? 'समय पर निकास' : 'Timely exits'}</p>
                </div>
              </div>

              {/* Real-time Inside Campus Table */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3 bg-slate-50 flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    {isHi ? 'वर्तमान में कैंपस के अंदर आगंतुक (Live Visitors Inside)' : 'Live Visitors Inside Campus'}
                  </h4>
                  <span className="text-xs text-slate-500 font-mono">
                    {activeVisitors.length} {isHi ? 'सक्रिय विज़िटर' : 'active'}
                  </span>
                </div>

                {activeVisitors.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    {isHi ? 'वर्तमान में कोई आगंतुक कैंपस के अंदर नहीं है।' : 'No visitors currently inside campus.'}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 overflow-x-auto">
                    {activeVisitors.map((v) => (
                      <div
                        key={v.id}
                        className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between text-xs hover:bg-slate-50 transition"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue font-bold">
                            {v.name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{v.name}</span>
                              <span className="text-slate-500 font-mono text-[11px]">({v.phone})</span>
                              {v.isApproved ? (
                                <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800">
                                  {isHi ? 'स्वीकृत' : 'Approved'}
                                </span>
                              ) : (
                                <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                                  {isHi ? 'अनधिकृत' : 'Unapproved'}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-slate-600">
                              <strong className="text-slate-700">{isHi ? 'छात्र:' : 'Student:'}</strong> {v.student} · {v.relation}
                            </p>
                            <p className="text-slate-500 italic text-[11px]">
                              {isHi ? 'प्रयोजन:' : 'Purpose:'} {v.reason}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                          <span className="font-mono text-slate-600 font-medium">
                            {isHi ? 'प्रवेश:' : 'Entry:'} {v.time}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleMarkExit(v.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition shadow-sm"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                            <span>{isHi ? 'निकास दर्ज करें' : 'Mark Exit'}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
