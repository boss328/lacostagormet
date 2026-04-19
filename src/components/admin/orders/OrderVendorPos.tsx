'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Po = {
  id: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  vendorName: string;
  vendorEmail: string | null;
  warehouseLabel: string | null;
  wholesale: number | null;
  subject: string | null;
};

export function OrderVendorPos({ pos }: { pos: Po[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function inlineSend(po: Po) {
    if (!po.vendorEmail) {
      setErr(`${po.vendorName} has no contact email — open the PO to fix.`);
      return;
    }
    if (!confirm(`Send PO to ${po.vendorEmail}? Subject: ${po.subject ?? '(none)'}`)) return;
    setErr(null);
    const fd = new FormData();
    // Inline send doesn't pass updated body — use the saved draft as-is.
    if (po.subject) fd.append('subject', po.subject);
    // Body is required by the route; fetch it server-side would be cleaner,
    // but to keep the round-trip simple we send a sentinel and let the
    // route fall back to the stored body when subject + body match the
    // existing draft. Easier path: keep this opening the PO detail page
    // for unsaved drafts (server-rendered subject is always available).
    start(async () => {
      // Do a quick GET-equivalent: open the PO detail in a new tab — simpler
      // mental model than attempting a partial-data send from this surface.
      router.push(`/admin/purchase-orders/${po.id}`);
    });
  }

  if (pos.length === 0) {
    return (
      <div
        className="bg-paper-2 px-5 py-6 text-center"
        style={{ border: '1px solid var(--rule)' }}
      >
        <p className="font-display italic text-ink-muted" style={{ fontSize: '15px' }}>
          No vendor POs drafted for this order yet.
        </p>
        <p className="type-data-mono text-ink-muted mt-2">
          Drafts auto-create when the order is paid; if the items have no preferred vendor set, no POs are created.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {pos.map((p) => (
        <li
          key={p.id}
          className="grid items-baseline gap-3 py-3"
          style={{
            gridTemplateColumns: 'minmax(160px,1fr) auto auto auto auto',
            borderBottom: '1px solid var(--rule)',
          }}
        >
          <span className="font-display text-ink truncate" style={{ fontSize: '14.5px' }}>
            {p.vendorName}
            {p.warehouseLabel && (
              <span className="type-data-mono text-ink-muted ml-2">· {p.warehouseLabel}</span>
            )}
          </span>
          <span className="type-data-mono text-ink-muted">
            {p.wholesale != null ? `$${p.wholesale.toFixed(2)} wh` : 'wh —'}
          </span>
          <span
            className="type-label-sm text-cream"
            style={{ padding: '3px 8px', background: p.statusColor }}
          >
            {p.statusLabel}
          </span>
          {p.status === 'pending' ? (
            <button
              type="button"
              onClick={() => inlineSend(p)}
              disabled={pending}
              className="type-label-sm text-cream"
              style={{ padding: '5px 12px', background: 'var(--color-brand-deep)' }}
            >
              Review &amp; send →
            </button>
          ) : (
            <span />
          )}
          <Link
            href={`/admin/purchase-orders/${p.id}/`}
            className="type-label-sm text-ink hover:text-brand-deep"
          >
            View →
          </Link>
        </li>
      ))}
      {err && (
        <li>
          <p className="type-data-mono text-accent py-3">{err}</p>
        </li>
      )}
    </ul>
  );
}
