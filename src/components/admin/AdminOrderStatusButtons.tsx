'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReorderButton } from '@/components/orders/ReorderButton';

type Props = {
  orderNumber: string;
  status: string;
  fulfillmentStatus: string;
};

/**
 * Admin transition buttons for an order. "Mark shipped" writes a
 * tracking number + updates fulfillment_status via
 * /api/admin/orders/[orderNumber]/ship.
 *
 * "Refund" is Level 1 — flips the order to status='refunded' and emails
 * the customer. The actual money movement happens manually in the
 * Authorize.Net merchant portal; this UI does NOT call the Auth.net
 * refund API. POSTs to /api/admin/orders/[orderNumber]/refund.
 */
export function AdminOrderStatusButtons({ orderNumber, status, fulfillmentStatus }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState('');
  const [showShipForm, setShowShipForm] = useState(false);
  const [showRefundPanel, setShowRefundPanel] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundError, setRefundError] = useState<string | null>(null);

  const canShip =
    status === 'paid' &&
    fulfillmentStatus !== 'shipped' &&
    fulfillmentStatus !== 'delivered';

  const canRefund =
    status === 'paid' || status === 'payment_held';
  const alreadyRefunded =
    status === 'refunded' || status === 'partially_refunded';

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

  async function markRefunded() {
    if (refunding) return;
    setRefunding(true);
    setRefundError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/refund/`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason: refundReason.trim() || undefined }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        errorMessage?: string;
      };
      if (!res.ok || !body.ok) {
        setRefundError(body.errorMessage ?? 'Could not mark as refunded.');
        return;
      }
      setShowRefundPanel(false);
      setRefundReason('');
      setMessage('Order marked as refunded. Customer notified.');
      // Refresh the route so the page re-renders with the updated
      // status badge + refund metadata block.
      router.refresh();
    } catch (e) {
      console.error('[admin refund]', e);
      setRefundError('Network error.');
    } finally {
      setRefunding(false);
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
        {!alreadyRefunded && !showRefundPanel && (
          <button
            type="button"
            onClick={() => {
              setShowRefundPanel(true);
              setRefundError(null);
            }}
            disabled={!canRefund}
            className={`btn btn-outline ${canRefund ? '' : 'opacity-60 cursor-not-allowed'}`}
            style={{
              padding: '14px 22px',
              minHeight: 44,
              borderColor: canRefund ? 'var(--color-accent)' : undefined,
              color: canRefund ? 'var(--color-accent)' : undefined,
            }}
            aria-disabled={!canRefund}
            title={
              canRefund
                ? 'Mark this order as refunded and notify the customer'
                : `Cannot refund an order in status "${status}"`
            }
          >
            <span>Refund</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </button>
        )}
        {alreadyRefunded && (
          <span
            className="type-label-sm"
            style={{
              padding: '12px 18px',
              border: '1px solid var(--color-brand)',
              color: 'var(--color-brand)',
              background: 'var(--color-paper)',
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Already refunded
          </span>
        )}
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

      {showRefundPanel && (
        <div
          className="mt-5 bg-cream"
          style={{ border: '1px solid var(--color-accent)', padding: '18px 20px' }}
          role="dialog"
          aria-labelledby="refund-heading"
        >
          <p
            id="refund-heading"
            className="font-display text-ink mb-2"
            style={{ fontSize: '20px', lineHeight: 1.2, letterSpacing: '-0.015em', fontWeight: 500 }}
          >
            Refund order #{orderNumber}?
          </p>
          <p className="type-data-mono text-ink-muted mb-4">
            This marks the order as refunded and emails the customer that
            their refund is processing. <strong>You still need to issue
            the actual refund through the Authorize.Net merchant portal
            separately</strong> — this UI does not move money.
          </p>
          <div className="flex flex-col gap-2 mb-4">
            <label htmlFor="refund-reason" className="type-label-sm text-ink">
              Reason (optional)
            </label>
            <textarea
              id="refund-reason"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="e.g. Customer requested cancellation"
              className="bg-paper text-ink font-display"
              style={{
                border: '1px solid var(--rule-strong)',
                padding: '10px 14px',
                fontSize: '14px',
                lineHeight: 1.4,
              }}
            />
            <span className="type-data-mono text-ink-muted">
              Included in the customer email when present.
            </span>
          </div>
          {refundError && (
            <p
              className="type-data-mono text-accent mb-3"
              role="alert"
              style={{ padding: '10px 12px', background: 'rgba(193, 72, 40, 0.08)' }}
            >
              {refundError}
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={markRefunded}
              disabled={refunding}
              className={`btn btn-solid ${refunding ? 'opacity-60 cursor-wait' : ''}`}
              style={{
                padding: '12px 22px',
                minHeight: 44,
                background: 'var(--color-accent)',
                color: 'var(--color-cream)',
              }}
            >
              <span>{refunding ? 'Marking…' : 'Mark as Refunded'}</span>
              {!refunding && <span className="btn-arrow" aria-hidden="true">→</span>}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRefundPanel(false);
                setRefundReason('');
                setRefundError(null);
              }}
              disabled={refunding}
              className="type-label text-ink-muted hover:text-ink transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className="type-data-mono text-ink-muted mt-3" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
