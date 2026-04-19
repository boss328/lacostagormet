'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { VendorOrderStatus } from '@/lib/admin/vendor-po';

type Warehouse = {
  id: string;
  label: string;
  city: string | null;
  state: string | null;
  is_primary: boolean;
};

type Item = {
  product_sku: string;
  product_name: string;
  quantity: number;
  unit_price: number | string;
  unit_wholesale_cost: number | string | null;
  line_subtotal: number | string;
};

const DROPSHIP_LINE_RE = /Drop ship from: .*\n?/;

export function PoEditor({
  poId,
  status,
  subject: initialSubject,
  body: initialBody,
  warehouseId: initialWarehouseId,
  warehouses,
  items,
  vendorEmail,
}: {
  poId: string;
  status: VendorOrderStatus;
  subject: string;
  body: string;
  warehouseId: string | null;
  warehouses: Warehouse[];
  items: Item[];
  vendorEmail: string | null;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [warehouseId, setWarehouseId] = useState<string | null>(initialWarehouseId);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const isDraft = status === 'pending';
  const sent = status === 'sent' || status === 'confirmed' || status === 'shipped' || status === 'delivered';

  function changeWarehouse(nextId: string) {
    const next = warehouses.find((w) => w.id === nextId) ?? null;
    setWarehouseId(nextId === '' ? null : nextId);
    // Re-render the "Drop ship from:" line in the body so the editor stays in sync
    if (!next) {
      setBody((prev) => prev.replace(DROPSHIP_LINE_RE, ''));
      return;
    }
    const line = `Drop ship from: ${next.label}\n`;
    setBody((prev) => {
      if (DROPSHIP_LINE_RE.test(prev)) {
        return prev.replace(DROPSHIP_LINE_RE, line);
      }
      // Insert before "Drop ship address:" if present
      const idx = prev.indexOf('Drop ship address:');
      if (idx === -1) return `${prev}\n${line}`;
      return `${prev.slice(0, idx)}${line}\n${prev.slice(idx)}`;
    });
  }

  function call(action: 'save' | 'send' | 'cancel' | 'mark-acknowledged' | 'mark-shipped') {
    setMsg(null);
    const fd = new FormData();
    fd.append('subject', subject);
    fd.append('body', body);
    if (warehouseId) fd.append('warehouse_id', warehouseId);
    start(async () => {
      const res = await fetch(`/api/admin/purchase-orders/${poId}/${action}`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const t = await res.text();
        setMsg({ kind: 'err', text: t || 'Action failed' });
        return;
      }
      setMsg({ kind: 'ok', text: action === 'save' ? 'Saved.' : action === 'send' ? `Sent to ${vendorEmail}` : 'Updated.' });
      router.refresh();
    });
  }

  return (
    <div
      className="bg-cream"
      style={{ border: '1px solid var(--rule-strong)', padding: '24px 26px' }}
    >
      <p className="type-label text-ink mb-4">§ Email draft</p>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="type-label-sm text-ink" htmlFor="subject">Subject</label>
          <input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!isDraft}
            className="bg-paper text-ink font-display"
            style={{ border: '1px solid var(--rule-strong)', padding: '9px 14px', fontSize: '14px' }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="type-label-sm text-ink" htmlFor="warehouse">Drop-ship warehouse</label>
          <select
            id="warehouse"
            value={warehouseId ?? ''}
            onChange={(e) => changeWarehouse(e.target.value)}
            disabled={!isDraft || warehouses.length === 0}
            className="bg-paper text-ink font-display"
            style={{ border: '1px solid var(--rule-strong)', padding: '9px 14px', fontSize: '14px' }}
          >
            <option value="">— No warehouse —</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
                {w.is_primary ? ' (primary)' : ''}
                {w.city || w.state ? ` · ${[w.city, w.state].filter(Boolean).join(', ')}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="type-label-sm text-ink" htmlFor="body">Body</label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={!isDraft}
            rows={18}
            className="bg-paper text-ink font-mono"
            style={{
              border: '1px solid var(--rule-strong)',
              padding: '12px 14px',
              fontSize: '12.5px',
              lineHeight: 1.55,
            }}
          />
        </div>
      </div>

      <div className="mt-5 pt-4" style={{ borderTop: '1px dashed var(--rule)' }}>
        <p className="type-label-sm text-ink mb-3">§ Items in this PO</p>
        {items.length === 0 ? (
          <p className="type-data-mono text-ink-muted py-3">
            No items assigned to this vendor on this order.
          </p>
        ) : (
          <ul className="flex flex-col">
            {items.map((it, i) => (
              <li
                key={`${it.product_sku}-${i}`}
                className="grid items-baseline gap-3 py-2"
                style={{
                  gridTemplateColumns: 'minmax(120px,auto) 1fr auto auto auto',
                  borderBottom: '1px solid var(--rule)',
                }}
              >
                <span className="type-data-mono text-ink-muted">{it.product_sku}</span>
                <span className="font-display text-ink truncate" style={{ fontSize: '13.5px' }}>
                  {it.product_name}
                </span>
                <span className="type-data-mono text-ink">qty {it.quantity}</span>
                <span className="type-data-mono text-ink-muted">
                  {it.unit_wholesale_cost != null ? `wh $${Number(it.unit_wholesale_cost).toFixed(2)}` : 'wh —'}
                </span>
                <span className="type-data-mono text-ink">
                  ${Number(it.line_subtotal).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3 flex-wrap">
        {isDraft && (
          <>
            <button
              type="button"
              disabled={pending || !vendorEmail}
              onClick={() => call('send')}
              className="type-label-sm text-cream"
              style={{
                padding: '11px 22px',
                background: 'var(--color-brand-deep)',
                opacity: pending || !vendorEmail ? 0.55 : 1,
              }}
              title={vendorEmail ? `Send to ${vendorEmail}` : 'Vendor has no contact email'}
            >
              Send via email →
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => call('save')}
              className="type-label-sm text-ink"
              style={{
                padding: '11px 18px',
                border: '1px solid var(--color-ink)',
                background: 'var(--color-cream)',
                opacity: pending ? 0.6 : 1,
              }}
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm('Cancel this PO? It cannot be re-drafted.')) call('cancel');
              }}
              className="type-label-sm text-ink-muted hover:text-accent ml-auto"
            >
              Cancel PO
            </button>
          </>
        )}
        {sent && status !== 'shipped' && status !== 'delivered' && (
          <>
            {status === 'sent' && (
              <button
                type="button"
                disabled={pending}
                onClick={() => call('mark-acknowledged')}
                className="type-label-sm text-ink"
                style={{ padding: '11px 18px', border: '1px solid var(--color-ink)', background: 'var(--color-cream)' }}
              >
                Mark acknowledged
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => call('mark-shipped')}
              className="type-label-sm text-cream"
              style={{ padding: '11px 22px', background: 'var(--color-forest)' }}
            >
              Mark shipped →
            </button>
          </>
        )}
        {status === 'cancelled' && (
          <span className="type-data-mono text-ink-muted">PO cancelled — read-only.</span>
        )}
        {msg && (
          <span
            className="type-data-mono"
            style={{ color: msg.kind === 'ok' ? 'var(--color-forest)' : 'var(--color-accent)' }}
          >
            {msg.text}
          </span>
        )}
      </div>

      {!vendorEmail && isDraft && (
        <p className="type-data-mono text-accent mt-3">
          Vendor has no contact email set — Send is disabled. Edit the vendor to add one.
        </p>
      )}
    </div>
  );
}
