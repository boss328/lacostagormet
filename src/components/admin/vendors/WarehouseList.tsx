'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Warehouse = {
  id: string;
  vendor_id: string;
  label: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  is_primary: boolean;
};

export function WarehouseList({
  vendorId,
  warehouses,
}: {
  vendorId: string;
  warehouses: Warehouse[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);

  function call(url: string, method: string, body?: BodyInit) {
    start(async () => {
      const res = await fetch(url, { method, body });
      if (!res.ok) {
        alert(await res.text());
        return;
      }
      router.refresh();
      setAdding(false);
    });
  }

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.append('vendor_id', vendorId);
    call('/api/admin/warehouses', 'POST', fd);
  }

  function setPrimary(id: string) {
    const fd = new FormData();
    fd.append('is_primary', 'true');
    call(`/api/admin/warehouses/${id}`, 'PATCH', fd);
  }

  function remove(id: string) {
    if (!confirm('Delete this warehouse? Drafts pointing to it will fall back to no warehouse.')) return;
    call(`/api/admin/warehouses/${id}`, 'DELETE');
  }

  return (
    <div
      className="bg-cream"
      style={{ border: '1px solid var(--rule-strong)', padding: '20px 22px' }}
    >
      <div className="flex items-baseline justify-between mb-4">
        <p className="type-label text-ink">§ Warehouses</p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="type-label-sm text-ink hover:text-brand-deep"
        >
          {adding ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {warehouses.length === 0 && !adding && (
        <p className="type-data-mono text-ink-muted py-2">
          No warehouses yet. Add one and POs will pre-populate the &ldquo;Drop ship from&rdquo; line.
        </p>
      )}

      <ul className="flex flex-col">
        {warehouses.map((w) => (
          <li
            key={w.id}
            className="grid items-baseline gap-3 py-2.5"
            style={{
              gridTemplateColumns: '1fr auto auto auto',
              borderBottom: '1px solid var(--rule)',
            }}
          >
            <span>
              <p className="font-display text-ink" style={{ fontSize: '14px' }}>
                {w.label}
                {w.is_primary && (
                  <span className="type-data-mono text-gold ml-2">primary</span>
                )}
              </p>
              <p className="type-data-mono text-ink-muted">
                {[w.city, w.state, w.zip].filter(Boolean).join(' · ') || '—'}
              </p>
            </span>
            {!w.is_primary && (
              <button
                type="button"
                onClick={() => setPrimary(w.id)}
                disabled={pending}
                className="type-label-sm text-ink-muted hover:text-brand-deep"
              >
                Make primary
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(w.id)}
              disabled={pending}
              className="type-label-sm text-ink-muted hover:text-accent"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {adding && (
        <form onSubmit={onAdd} className="mt-4 pt-4 flex flex-col gap-3" style={{ borderTop: '1px dashed var(--rule)' }}>
          <input
            name="label"
            placeholder="Label (e.g. Portland OR warehouse)"
            required
            className="bg-paper text-ink font-display"
            style={{ border: '1px solid var(--rule-strong)', padding: '9px 14px', fontSize: '13.5px' }}
          />
          <div className="grid gap-3 grid-cols-3">
            <input
              name="city"
              placeholder="City"
              className="bg-paper text-ink font-display"
              style={{ border: '1px solid var(--rule-strong)', padding: '9px 14px', fontSize: '13.5px' }}
            />
            <input
              name="state"
              placeholder="State"
              maxLength={2}
              className="bg-paper text-ink font-display"
              style={{ border: '1px solid var(--rule-strong)', padding: '9px 14px', fontSize: '13.5px' }}
            />
            <input
              name="zip"
              placeholder="ZIP"
              className="bg-paper text-ink font-display"
              style={{ border: '1px solid var(--rule-strong)', padding: '9px 14px', fontSize: '13.5px' }}
            />
          </div>
          <label className="type-data-mono text-ink-muted flex items-center gap-2">
            <input type="checkbox" name="is_primary" value="true" /> Set as primary
          </label>
          <div>
            <button
              type="submit"
              disabled={pending}
              className="type-label-sm text-cream"
              style={{ padding: '9px 16px', background: 'var(--color-ink)', opacity: pending ? 0.6 : 1 }}
            >
              {pending ? 'Adding…' : 'Add warehouse'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
