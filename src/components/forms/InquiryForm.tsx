'use client';

import { useState } from 'react';

const VOLUME_OPTIONS = [
  { value: '', label: 'Select an estimate' },
  { value: 'under-500', label: 'Under $500 / month' },
  { value: '500-2k', label: '$500 – $2,000 / month' },
  { value: '2k-5k', label: '$2,000 – $5,000 / month' },
  { value: '5k-plus', label: '$5,000+ / month' },
] as const;

type FormState = {
  name: string;
  business: string;
  email: string;
  phone: string;
  volume: string;
  notes: string;
};

const EMPTY: FormState = {
  name: '',
  business: '',
  email: '',
  phone: '',
  volume: '',
  notes: '',
};

/**
 * Wired version of the /for-business inquiry form. Posts to
 * /api/inquiries/submit, shows an editorial confirmation card on
 * success, surfaces validation/server errors above the form on
 * failure (preserving every keystroke).
 */
export function InquiryForm() {
  const [values, setValues] = useState<FormState>(EMPTY);
  const [state, setState] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setState('submitting');
    try {
      const res = await fetch('/api/inquiries/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          business_name: values.business,
          email: values.email,
          phone: values.phone,
          volume_estimate: values.volume,
          notes: values.notes,
        }),
      });
      const body = (await res.json()) as
        | { success: true; warning?: string }
        | { success: false; errorMessage?: string };

      if (!body.success) {
        setError(body.errorMessage ?? 'Something went wrong. Try again or call us.');
        setState('error');
        return;
      }
      setState('sent');
    } catch (err) {
      console.error('[inquiry-form] submit failed', err);
      setError('Network hiccup — try again or call us at (858) 354-1120.');
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <div
        className="bg-cream"
        style={{ border: '1px solid var(--rule-strong)', padding: '40px 36px' }}
        role="status"
      >
        <p className="type-label text-accent mb-5">§ Inquiry received</p>
        <p
          className="font-display italic text-brand-deep mb-4"
          style={{ fontSize: '32px', lineHeight: 1.05, letterSpacing: '-0.025em', fontWeight: 500 }}
        >
          We got it.
        </p>
        <p
          className="type-body pl-5"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, var(--color-gold) 0%, transparent 100%)',
            backgroundSize: '1px 100%',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'left top',
            fontSize: '15.5px',
            lineHeight: 1.6,
          }}
        >
          Jeff will reply within a business day. If you need an answer sooner,
          the line is open Monday thru Friday, 9–5 Pacific.
        </p>
      </div>
    );
  }

  return (
    <form
      className="bg-cream max-md:!p-5"
      style={{ border: '1px solid var(--rule-strong)', padding: '32px' }}
      onSubmit={onSubmit}
      noValidate
    >
      {error && (
        <div
          role="alert"
          className="mb-5 px-4 py-3"
          style={{
            border: '1px solid var(--color-accent)',
            background: 'var(--color-paper-2)',
          }}
        >
          <p className="type-data-mono text-accent">{error}</p>
        </div>
      )}

      <div className="grid gap-5 max-md:gap-3">
        <Field
          label="Your name"
          name="name"
          type="text"
          required
          value={values.name}
          onChange={(v) => update('name', v)}
        />
        <Field
          label="Business name"
          name="business"
          type="text"
          required
          value={values.business}
          onChange={(v) => update('business', v)}
        />
        <div className="grid gap-5 max-md:gap-3 sm:grid-cols-2">
          <Field
            label="Email"
            name="email"
            type="email"
            required
            value={values.email}
            onChange={(v) => update('email', v)}
          />
          <Field
            label="Phone"
            name="phone"
            type="tel"
            value={values.phone}
            onChange={(v) => update('phone', v)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="volume" className="type-label-sm text-ink">
            Monthly volume estimate
          </label>
          <select
            id="volume"
            name="volume"
            value={values.volume}
            onChange={(e) => update('volume', e.target.value)}
            className="bg-cream text-ink font-display"
            style={{
              border: '1px solid var(--rule-strong)',
              padding: '12px 14px',
              fontSize: '15px',
              lineHeight: 1.4,
            }}
          >
            {VOLUME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="notes" className="type-label-sm text-ink">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            value={values.notes}
            onChange={(e) => update('notes', e.target.value)}
            className="bg-cream text-ink font-display"
            style={{
              border: '1px solid var(--rule-strong)',
              padding: '12px 14px',
              fontSize: '15px',
              lineHeight: 1.5,
              resize: 'vertical',
            }}
            placeholder="SKUs you're interested in, current supplier, anything we should know."
          />
        </div>
        <div className="pt-2">
          <button
            type="submit"
            disabled={state === 'submitting'}
            className={`btn btn-solid w-full justify-center ${state === 'submitting' ? 'opacity-60 cursor-not-allowed' : ''}`}
            style={{ padding: '18px 26px' }}
          >
            <span>{state === 'submitting' ? 'Sending…' : 'Send inquiry'}</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type,
  required = false,
  value,
  onChange,
}: {
  label: string;
  name: string;
  type: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="type-label-sm text-ink">
        {label}
        {required && <span className="text-accent ml-1" aria-hidden="true">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={
          name === 'email'
            ? 'email'
            : name === 'phone'
              ? 'tel'
              : name === 'name'
                ? 'name'
                : name === 'business'
                  ? 'organization'
                  : 'off'
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-cream text-ink font-display"
        style={{
          border: '1px solid var(--rule-strong)',
          padding: '12px 14px',
          fontSize: '15px',
          lineHeight: 1.4,
        }}
      />
    </div>
  );
}
