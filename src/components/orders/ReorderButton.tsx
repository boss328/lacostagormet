'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/stores/cart';
import type { AddressPayload } from '@/lib/checkout/validate';

type ReorderResponse = {
  reorderable_items: Array<{
    product_id: string;
    sku: string;
    name: string;
    slug: string;
    brand_name: string | null;
    pack_size: string | null;
    image_url: string | null;
    quantity: number;
    current_price: number;
    original_price: number;
  }>;
  unavailable_items: Array<{ sku: string; name: string; reason: string }>;
  shipping_address: AddressPayload | null;
  source_order_number: string;
};

type Props = {
  orderNumber: string;
  /** Visual variant — admin pages use 'outline' to sit beside the
   *  Refund button; customer pages use 'solid' for prominence. */
  variant?: 'solid' | 'outline';
  /** Optional class override for layout context. */
  className?: string;
};

/**
 * Single button + modal that drives the entire reorder flow:
 * fetch → confirm-with-warnings (if any items unavailable) → hydrate
 * cart → redirect to /cart/confirm-address. Shared by customer
 * /account/orders/[orderNumber] and admin /admin/orders/[orderNumber].
 */
export function ReorderButton({ orderNumber, variant = 'outline', className = '' }: Props) {
  const router = useRouter();
  const hydrate = useCartStore((s) => s.hydrateFromReorder);
  const cartItemCount = useCartStore((s) => s.items.length);

  const [state, setState] = useState<'idle' | 'fetching' | 'confirm' | 'submitting'>('idle');
  const [response, setResponse] = useState<ReorderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buttonClasses =
    variant === 'solid' ? 'btn btn-solid' : 'btn btn-outline';

  async function startReorder() {
    setError(null);
    setState('fetching');
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(orderNumber)}/reorder`,
        { method: 'POST' },
      );
      const body = (await res.json().catch(() => ({}))) as
        | ReorderResponse
        | { errorMessage?: string };
      if (!res.ok) {
        setError((body as { errorMessage?: string }).errorMessage ?? 'Could not reorder.');
        setState('idle');
        return;
      }
      const r = body as ReorderResponse;
      setResponse(r);
      // Open confirmation modal if we have anything to warn the user
      // about (existing cart contents OR unavailable items). Otherwise
      // skip straight to hydrate + redirect.
      const needsConfirm = r.unavailable_items.length > 0 || cartItemCount > 0;
      if (needsConfirm) {
        setState('confirm');
      } else {
        proceed(r);
      }
    } catch (e) {
      console.error('[reorder] fetch failed', e);
      setError('Network error — try again in a moment.');
      setState('idle');
    }
  }

  function proceed(r: ReorderResponse) {
    if (r.reorderable_items.length === 0) {
      // Nothing to add — leave the user on the page with a clear note.
      setError(
        'None of these items are available to reorder. The catalog has moved on since this order — call (760) 931-1028 if you need help finding equivalents.',
      );
      setState('idle');
      return;
    }
    setState('submitting');
    hydrate({
      items: r.reorderable_items.map((it) => ({
        product_id: it.product_id,
        sku: it.sku,
        name: it.name,
        slug: it.slug,
        brand_name: it.brand_name,
        price: it.current_price,
        pack_size: it.pack_size,
        image_url: it.image_url,
        quantity: it.quantity,
      })),
      address: r.shipping_address,
      unavailable: r.unavailable_items.map((u) => u.name),
      sourceOrderNumber: r.source_order_number,
      replace: true,
    });
    router.push('/cart/confirm-address/');
  }

  return (
    <>
      <div className={`flex flex-col items-start gap-2 ${className}`}>
        <button
          type="button"
          onClick={startReorder}
          disabled={state === 'fetching' || state === 'submitting'}
          className={`${buttonClasses} ${state !== 'idle' ? 'opacity-70 cursor-not-allowed' : ''}`}
          style={{ padding: '14px 22px', minHeight: 44 }}
        >
          <span>{state === 'fetching' ? 'Loading…' : state === 'submitting' ? 'Adding to cart…' : 'Reorder'}</span>
          <span className="btn-arrow" aria-hidden="true">→</span>
        </button>
        {error && (
          <p className="type-data-mono text-accent" role="alert" style={{ maxWidth: 480 }}>
            {error}
          </p>
        )}
      </div>

      {state === 'confirm' && response && (
        <div
          role="dialog"
          aria-label="Confirm reorder"
          className="fixed inset-0 z-50 flex items-center justify-center px-5"
          style={{ background: 'rgba(26, 17, 10, 0.55)' }}
          onClick={() => setState('idle')}
        >
          <div
            className="bg-cream max-w-[560px] w-full"
            style={{ border: '1px solid var(--rule-strong)', padding: '32px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="type-label text-accent mb-3">§ Confirm reorder</p>
            <h2
              className="font-display text-ink mb-4"
              style={{ fontSize: '26px', lineHeight: 1.1, letterSpacing: '-0.02em' }}
            >
              {response.unavailable_items.length > 0
                ? 'Some items aren\u2019t available'
                : 'Replace your current cart?'}
            </h2>
            <p className="type-body mb-5">
              {response.reorderable_items.length} item
              {response.reorderable_items.length === 1 ? '' : 's'} from order{' '}
              <em className="type-accent">{response.source_order_number}</em> can be added.
              {cartItemCount > 0 && ' Your current cart will be replaced.'}
            </p>

            {response.unavailable_items.length > 0 && (
              <div
                className="bg-paper-2 mb-6"
                style={{ border: '1px solid var(--rule)', padding: '14px 16px' }}
              >
                <p className="type-label-sm text-ink-muted mb-2">
                  Won&rsquo;t be added — no longer available:
                </p>
                <ul className="flex flex-col gap-1 max-h-[180px] overflow-y-auto">
                  {response.unavailable_items.map((u) => (
                    <li key={u.sku} className="font-display text-ink-2" style={{ fontSize: '13.5px' }}>
                      <span className="type-data-mono text-ink-muted">{u.sku}</span>
                      &nbsp;·&nbsp;{u.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => proceed(response)}
                disabled={response.reorderable_items.length === 0}
                className={`btn btn-solid ${response.reorderable_items.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{ padding: '13px 22px' }}
              >
                <span>
                  {response.reorderable_items.length === 0
                    ? 'Nothing to add'
                    : 'Continue with available items'}
                </span>
                <span className="btn-arrow" aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                onClick={() => setState('idle')}
                className="type-label text-ink-muted hover:text-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
