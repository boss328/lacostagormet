'use client';

import { useState } from 'react';
import { ReorderButton } from '@/components/orders/ReorderButton';

type Props = {
  orderNumber: string;
  status: string;
  fulfillmentStatus: string;
};

/**
 * Admin transition buttons for an order. Phase 6 implements "Mark shipped"
 * which writes a tracking number + updates fulfillment_status via
 * /api/admin/orders/[orderNumber]/ship. Refund is a placeholder for Phase 7
 * (Auth.net refund flow).
 */
export function AdminOrderStatusButtons({ orderNumber, status, fulfillmentStatus }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState('');
  const [showShipForm, setShowShipForm] = useState(false);

  const canShip =
    status === 'paid' &&
    fulfillmentStatus !== 'shipped' &&
    fulfillmentStatus !== 'delivered';

  async function markShipped(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/ship`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tracking_number: trackingInput.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.errorMessage ?? 'Could not mark shipped.');
      } else {
        setMessage('Marked shipped. Reload to see updated status.');
        setShowShipForm(false);
      }
    } catch (e) {
      console.error('[admin ship]', e);
      setMessage('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="p-5"
      style={{
        border: '1px solid var(--rule-strong)',
        background: 'var(--color-paper-2)',
      }}
    >
      <p className="type-label text-ink mb-4">§&nbsp;&nbsp;Transitions</p>
      <div className="flex items-center gap-3 flex-wrap">
        {canShip && !showShipForm && (
          <button
            type="button"
            onClick={() => setShowShipForm(true)}
            className="btn btn-solid"
            style={{ padding: '14px 22px', minHeight: 44 }}
          >
            <span>Mark shipped</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </button>
        )}
        <button
          type="button"
          disabled
          className="btn btn-outline opacity-60 cursor-not-allowed"
          style={{ padding: '14px 22px', minHeight: 44 }}
          aria-disabled="true"
          title="Refund flow ships in Phase 7"
        >
          <span>Refund</span>
          <span className="btn-arrow" aria-hidden="true">→</span>
        </button>
        {/* Staff-assisted reorder — copies the items + shipping address
            into the admin user's own session cart, redirects to
            /cart/confirm-address. Customer doesn't see this; the rep
            walks the order through checkout themselves. */}
        <ReorderButton orderNumber={orderNumber} variant="outline" />
      </div>

      {showShipForm && (
        <form onSubmit={markShipped} className="mt-4 flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-2 flex-1 min-w-[240px]">
            <label htmlFor="tracking" className="type-label-sm text-ink">
              Tracking number
            </label>
            <input
              id="tracking"
              name="tracking"
              type="text"
              required
              value={trackingInput}
              onChange={(e) => setTrackingInput(e.target.value)}
              autoFocus
              className="bg-cream text-ink font-display"
              style={{
                border: '1px solid var(--rule-strong)',
                padding: '10px 14px',
                fontSize: '14px',
                minHeight: 44,
              }}
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !trackingInput.trim()}
            className={`btn btn-solid ${submitting || !trackingInput.trim() ? 'opacity-60 cursor-not-allowed' : ''}`}
            style={{ padding: '12px 22px', minHeight: 44 }}
          >
            <span>{submitting ? 'Saving…' : 'Save'}</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowShipForm(false);
              setTrackingInput('');
            }}
            className="type-label text-ink-muted hover:text-accent transition-colors duration-200"
          >
            Cancel
          </button>
        </form>
      )}

      {message && (
        <p className="type-data-mono text-ink-muted mt-3" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
