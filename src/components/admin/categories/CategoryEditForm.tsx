'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Category = {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
};

export function CategoryEditForm({
  category,
  productCount,
}: {
  category: Category;
  productCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [isActive, setIsActive] = useState(category.is_active);
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
      const res = await fetch(`/api/admin/categories/${category.id}/`, { method: 'PATCH', body: fd });
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
        ? `"${category.name}" has ${productCount} product${productCount === 1 ? '' : 's'} in it. It can't be hard-deleted, so it will be hidden from the storefront instead. Continue?`
        : `Delete "${category.name}"? This can't be undone.`,
    );
    if (!ok) return;
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/categories/${category.id}/`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        deleted?: boolean;
        deactivated?: boolean;
      };
      if (!res.ok || !data.ok) {
        setError('Could not delete the category.');
        setDeleting(false);
        return;
      }
      if (data.deactivated) {
        setIsActive(false);
        setMessage('Category has products, so it was hidden from the storefront instead of deleted.');
        setDeleting(false);
        router.refresh();
        return;
      }
      router.push('/admin/categories/');
      router.refresh();
    } catch {
      setError('Network error. Try again.');
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="bg-cream" style={{ border: '1px solid var(--rule-strong)', padding: '20px 22px' }}>
        <p className="type-label text-ink mb-4">§ Category info</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field name="name" label="Name" defaultValue={category.name} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="slug" label="URL slug" defaultValue={category.slug} mono />
            <Field
              name="display_order"
              label="Order"
              type="number"
              defaultValue={String(category.display_order)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="description" className="type-label-sm text-ink">Description</label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={category.description ?? ''}
              className="bg-paper text-ink font-display"
              style={{ border: '1px solid var(--rule-strong)', padding: '9px 14px', fontSize: '13.5px' }}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="meta_title" label="Meta title (SEO)" defaultValue={category.meta_title} />
            <Field name="meta_description" label="Meta description (SEO)" defaultValue={category.meta_description} />
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
            ? `This category has ${productCount} product${productCount === 1 ? '' : 's'}, so deleting it will hide it from the storefront instead of removing it — the products stay put.`
            : 'No products reference this category, so it can be permanently deleted.'}
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
          {deleting ? 'Working…' : productCount > 0 ? 'Hide category' : 'Delete category'}
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
