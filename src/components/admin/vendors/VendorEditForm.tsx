'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Vendor = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_name: string | null;
  phone: string | null;
  terms: string | null;
  notes: string | null;
};

export function VendorEditForm({ vendor }: { vendor: Vendor }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await fetch(`/api/admin/vendors/${vendor.id}`, {
        method: 'PATCH',
        body: fd,
      });
      if (!res.ok) {
        const t = await res.text();
        setError(t || 'Save failed');
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div
      className="bg-cream"
      style={{ border: '1px solid var(--rule-strong)', padding: '20px 22px' }}
    >
      <p className="type-label text-ink mb-4">§ Contact info</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field name="name" label="Vendor name" defaultValue={vendor.name} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="contact_email" label="Contact email" type="email" defaultValue={vendor.contact_email} />
          <Field name="contact_name" label="Contact name" defaultValue={vendor.contact_name} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="phone" label="Phone" defaultValue={vendor.phone} />
          <Field name="terms" label="Terms" defaultValue={vendor.terms} placeholder="Net 30" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="notes" className="type-label-sm text-ink">Notes</label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={vendor.notes ?? ''}
            className="bg-paper text-ink font-display"
            style={{ border: '1px solid var(--rule-strong)', padding: '9px 14px', fontSize: '13.5px' }}
          />
        </div>
        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="type-label-sm text-cream"
            style={{ padding: '10px 18px', background: 'var(--color-ink)', opacity: pending ? 0.6 : 1 }}
          >
            {pending ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <span className="type-data-mono text-forest">Saved.</span>}
          {error && <span className="type-data-mono text-accent">{error}</span>}
        </div>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = 'text',
  required,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="type-label-sm text-ink">
        {label} {required && <span className="text-accent" aria-hidden="true">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        required={required}
        placeholder={placeholder}
        className="bg-paper text-ink font-display"
        style={{ border: '1px solid var(--rule-strong)', padding: '9px 14px', fontSize: '13.5px' }}
      />
    </div>
  );
}
