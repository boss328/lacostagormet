import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function NewVendorPage() {
  return (
    <>
      <Link
        href="/admin/vendors"
        className="type-label text-ink-muted hover:text-brand-deep transition-colors duration-200 inline-block mb-5"
      >
        ← All vendors
      </Link>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ V. Vendors / New</p>
        <h1
          className="font-display text-ink"
          style={{ fontSize: '36px', lineHeight: 1, letterSpacing: '-0.024em' }}
        >
          Add a <em className="type-accent">vendor</em>.
        </h1>
      </header>

      <form
        action="/api/admin/vendors/create"
        method="POST"
        className="max-w-[640px] flex flex-col gap-5"
      >
        <Field name="name" label="Vendor name" required />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="contact_email" label="Contact email" type="email" required />
          <Field name="contact_name" label="Contact name" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="phone" label="Phone" />
          <Field name="terms" label="Terms (e.g. Net 30)" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="notes" className="type-label-sm text-ink">Notes</label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            className="bg-cream text-ink font-display"
            style={{ border: '1px solid var(--rule-strong)', padding: '10px 14px', fontSize: '14px' }}
          />
        </div>
        <div className="flex gap-4 pt-3">
          <button
            type="submit"
            className="type-label-sm text-cream"
            style={{ padding: '12px 22px', background: 'var(--color-ink)' }}
          >
            Create vendor →
          </button>
          <Link
            href="/admin/vendors"
            className="type-label-sm text-ink-muted hover:text-accent self-center"
          >
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}

function Field({
  name,
  label,
  type = 'text',
  required,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="type-label-sm text-ink">
        {label} {required && <span className="text-accent" aria-hidden="true">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        className="bg-cream text-ink font-display"
        style={{ border: '1px solid var(--rule-strong)', padding: '10px 14px', fontSize: '14px' }}
      />
    </div>
  );
}
