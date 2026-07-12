'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Brand = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  description: string | null;
  primary_vendor_id: string | null;
};

export function BrandEditForm({
  brand,
  vendors,
  productCount,
}: {
  brand: Brand;
  vendors: Array<{ id: string; name: string }>;
  productCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [isActive, setIsActive] = useState(brand.is_active);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    fd.set('is_active', isActive ? 'true' : 'false');
    start(async () => {
      const res = await fetch(`/api/admin/brands/${brand.id}/`, { method: 'PATCH', body: fd });
      if (!res.ok) {
        setError((await res.text()) || 'Save failed');
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  async function onDelete() {
    if (pending || deleting) return;
    const ok = window.confirm(
      productCount > 0
        ? `"${brand.name}" has ${productCount} product${productCount === 1 ? '' : 's'}. It can't be hard-deleted, so it will be hidden from the storefront instead. Continue?`
        : `Delete "${brand.name}"? This can't be undone.`,
    );
    if (!ok) return;
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/brands/${brand.id}/`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        deleted?: boolean;
        deactivated?: boolean;
      };
      if (!res.ok || !data.ok) {
        setError('Could not delete the brand.');
        setDeleting(false);
        return;
      }
      if (data.deactivated) {
        setIsActive(false);
        setMessage('Brand has products, so it was hidden from the storefront instead of deleted.');
        setDeleting(false);
        router.refresh();
        return;
      }
      router.push('/admin/brands/');
      router.refresh();
    } catch {
      setError('Network error. Try again.');
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="bg-cream" style={{ border: '1px solid var(--rule-strong)', padding: '20px 22px' }}>
        <p className="type-label text-ink mb-4">§ Brand info</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field name="name" label="Name" defaultValue={brand.name} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="type-label-sm text-ink">
                URL slug <span className="type-data-mono text-ink-muted">· fixed</span>
              </label>
              <input
                defaultValue={brand.slug}
                readOnly
                aria-readonly="true"
                title="The URL slug is wired into /brand/[slug] links and can't be changed here. Ask a dev to change it."
                className="bg-paper-2 text-ink-muted"
                style={{ border: '1px solid var(--rule-strong)', padding: '9px 14px', fontSize: '13.5px', fontFamily: 'var(--font-mono)', cursor: 'not-allowed' }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="primary_vendor_id" className="type-label-sm text-ink">
                Preferred vendor
              </label>
              <select
                id="primary_vendor_id"
                name="primary_vendor_id"
                defaultValue={brand.primary_vendor_id ?? ''}
                className="bg-paper text-ink font-display"
                style={{ border: '1px solid var(--rule-strong)', padding: '9px 14px', fontSize: '13.5px' }}
              >
                <option value="">— None —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="description" className="type-label-sm text-ink">Description</label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={brand.description ?? ''}
              className="bg-paper text-ink font-display"
              style={{ border: '1px solid var(--rule-strong)', padding: '9px 14px', fontSize: '13.5px' }}
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-brand-deep"
              style={{ width: 16, height: 16 }}
            />
            <span className="font-display text-ink-2" style={{ fontSize: '14px' }}>
              Visible on storefront
            </span>
          </label>
          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={pending || deleting}
              className="type-label-sm text-cream"
              style={{ padding: '10px 18px', background: 'var(--color-ink)', opacity: pending ? 0.6 : 1 }}
            >
              {pending ? 'Saving…' : 'Save changes'}
            </button>
            {saved && <span className="type-data-mono text-forest">Saved.</span>}
            {message && <span className="type-data-mono text-brand-deep">{message}</span>}
            {error && <span className="type-data-mono text-accent">{error}</span>}
          </div>
        </form>
      </div>

      <section className="mt-12 pt-6" style={{ borderTop: '1px solid var(--rule)' }}>
        <p className="type-label text-accent mb-3">§ Danger zone</p>
        <p className="type-data-mono text-ink-muted mb-4 max-w-[640px]">
          {productCount > 0
            ? `This brand has ${productCount} product${productCount === 1 ? '' : 's'}, so deleting it will hide it from the storefront instead of removing it — the products stay put.`
            : 'No products reference this brand, so it can be permanently deleted.'}
        </p>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending || deleting}
          className="type-label inline-flex items-center gap-2"
          style={{
            padding: '12px 20px',
            border: '1px solid var(--accent)',
            color: 'var(--color-accent)',
            background: 'transparent',
            opacity: pending || deleting ? 0.6 : 1,
          }}
        >
          {deleting ? 'Working…' : productCount > 0 ? 'Hide brand' : 'Delete brand'}
        </button>
      </section>
    </>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = 'text',
  required,
  mono,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  type?: string;
  required?: boolean;
  mono?: boolean;
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
        className="bg-paper text-ink font-display"
        style={{
          border: '1px solid var(--rule-strong)',
          padding: '9px 14px',
          fontSize: '13.5px',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
        }}
      />
    </div>
  );
}
