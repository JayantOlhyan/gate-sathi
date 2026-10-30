'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ContactFormLabels {
  fieldName: string;
  fieldSchool: string;
  fieldRole: string;
  fieldPhone: string;
  fieldMessage: string;
  submitPilotBtn: string;
  submittingPilot: string;
  thankYouMessage: string;
  errorMessage: string;
  rateLimitMessage: string;
}

export function ContactForm({ labels }: { labels: ContactFormLabels }) {
  const [name, setName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // Honeypot for bots
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error' | 'ratelimit'
  >('idle');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('submitting');

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          schoolName,
          role,
          phone,
          message,
          website,
        }),
      });

      if (response.status === 429) {
        setStatus('ratelimit');
        return;
      }

      if (!response.ok) {
        setStatus('error');
        return;
      }

      setStatus('success');
      setName('');
      setSchoolName('');
      setRole('');
      setPhone('');
      setMessage('');
      setWebsite('');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div
        role="status"
        className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800"
      >
        {labels.thankYouMessage}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Hidden Honeypot Field for Bots */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="contact-name">{labels.fieldName}</Label>
          <Input
            id="contact-name"
            name="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contact-school">{labels.fieldSchool}</Label>
          <Input
            id="contact-school"
            name="schoolName"
            type="text"
            required
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contact-role">{labels.fieldRole}</Label>
          <Input
            id="contact-role"
            name="role"
            type="text"
            required
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contact-phone">{labels.fieldPhone}</Label>
          <Input
            id="contact-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact-message">{labels.fieldMessage}</Label>
        <textarea
          id="contact-message"
          name="message"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        />
      </div>

      {status === 'error' && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          {labels.errorMessage}
        </p>
      )}

      {status === 'ratelimit' && (
        <p
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
        >
          {labels.rateLimitMessage}
        </p>
      )}

      <Button
        type="submit"
        disabled={status === 'submitting'}
        className="h-11 w-full bg-brand-blue px-6 text-sm font-semibold text-white hover:bg-brand-blue/90 sm:w-auto"
      >
        {status === 'submitting'
          ? labels.submittingPilot
          : labels.submitPilotBtn}
      </Button>
    </form>
  );
}
