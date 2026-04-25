'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Minus, Plus, X } from 'lucide-react';
import {
  useCartStore,
  selectSubtotal,
  selectShipping,
  selectTotal,
  selectItemCount,
  FREE_SHIPPING_THRESHOLD,
  VOLUME_TIER_1_THRESHOLD,
  VOLUME_TIER_2_THRESHOLD,
  type CartItem,
} from '@/stores/cart';
import { formatPackSize } from '@/lib/pack-size';
import { Button } from '@/components/design-system/Button';

const CREAM_BG =
  'radial-gradient(ellipse at center, var(--color-cream) 0%, var(--color-paper-2) 115%)';

function splitPrice(n: number): { dollars: string; cents: string } {
  const [d, c = '00'] = n.toFixed(2).split('.');
  return { dollars: d, cents: c.padEnd(2, '0').slice(0, 2) };
}

function Price({ amount, size = 22 }: { amount: number; size?: number }) {
  const { dollars, cents } = splitPrice(amount);
  return (
    <span
      className="type-price"
      style={{ fontSize: `${size}px`, lineHeight: 1 }}
    >
      ${dollars}
      <sup
        className="font-display"
        style={{
          fontSize: `${Math.round(size * 0.48)}px`,
          color: 'var(--color-ink-muted)',
          marginLeft: '2px',
          verticalAlign: 'super',
        }}
      >
        {cents}
      </sup>
    </span>
  );
}

function LineRow({ item }: { item: CartItem }) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const lineTotal = item.price * item.quantity;
  const pack = formatPackSize(item.pack_size);

  return (
    <div
      className="grid items-center gap-5 py-6 max-sm:gap-3"
      style={{
        gridTemplateColumns: '80px 1fr auto auto',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div
        className="relative overflow-hidden"
        style={{ width: 80, height: 80, background: CREAM_BG, border: '1px solid var(--rule)' }}
      >
        {item.image_url ? (
          <div className="absolute inset-0" style={{ padding: 6 }}>
            <Image
              src={item.image_url}
              alt={item.name}
              width={160}
              height={160}
              sizes="80px"
              className="w-full h-full object-contain img-product"
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="type-label-sm text-ink-muted">{item.sku}</span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex flex-col gap-1">
        <span className="type-label-sm text-ink-muted">{item.brand_name ?? '—'}</span>
        <Link
          href={`/product/${item.slug}`}
          className="type-product text-ink hover:text-brand-deep transition-colors duration-200 line-clamp-2"
        >
          {item.name}
        </Link>
        {pack && (
          <span className="type-data-mono text-brand">{pack}</span>
        )}
        <button
          type="button"
          onClick={() => removeItem(item.product_id)}
          className="type-label-sm text-ink-muted hover:text-accent transition-colors duration-200 inline-flex items-center gap-1.5 self-start mt-1"
        >
          <X size={11} strokeWidth={1.75} aria-hidden="true" />
          <span>Remove</span>
        </button>
      </div>

      <div
        className="inline-flex items-stretch shrink-0"
        style={{ border: '1px solid var(--rule-strong)' }}
      >
        <button
          type="button"
          onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
          aria-label="Decrease quantity"
          className="flex items-center justify-center text-ink hover:bg-paper-2 transition-colors duration-200"
          style={{ width: 34, height: 34 }}
        >
          <Minus size={12} strokeWidth={1.75} />
        </button>
        <span
          className="flex items-center justify-center font-mono text-ink"
          style={{
            width: 40,
            fontSize: '13px',
            letterSpacing: '0.08em',
            borderLeft: '1px solid var(--rule)',
            borderRight: '1px solid var(--rule)',
          }}
          aria-live="polite"
        >
          {item.quantity}
        </span>
        <button
          type="button"
          onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
          aria-label="Increase quantity"
          className="flex items-center justify-center text-ink hover:bg-paper-2 transition-colors duration-200"
          style={{ width: 34, height: 34 }}
        >
          <Plus size={12} strokeWidth={1.75} />
        </button>
      </div>

      <div className="text-right shrink-0 min-w-[90px]">
        <Price amount={lineTotal} size={20} />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="bg-paper-2 text-center px-10 py-20 max-sm:px-5 max-sm:py-14"
      style={{ border: '1px solid var(--rule)' }}
    >
      <p className="type-label text-accent mb-6">§ The register</p>
      <h2 className="type-display-2 mb-4">
        Your cart is <em className="type-accent">empty</em>.
      </h2>
      <p
        className="font-display italic text-brand-deep mb-10 max-w-[32ch] mx-auto"
        style={{ fontSize: '22px', lineHeight: 1.25, letterSpacing: '-0.02em' }}
      >
        Ready when you are.
      </p>
      <Button variant="solid" arrow href="/shop">
        Shop the Catalog
      </Button>
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STORAGE_KEY_EMAIL = 'lcg-recovery-email';
const SAVE_DEBOUNCE_MS = 1_000;

export function CartContents() {
  const [hydrated, setHydrated] = useState(false);
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const subtotal = useCartStore(selectSubtotal);
  const shipping = useCartStore(selectShipping);
  const total = useCartStore(selectTotal);
  const itemCount = useCartStore(selectItemCount);
  const reorder = useCartStore((s) => s.reorder);
  const dismissUnavailable = useCartStore((s) => s.dismissUnavailableNotice);

  const router = useRouter();
  const searchParams = useSearchParams();

  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryStatus, setRecoveryStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error' | 'unavailable'
  >('idle');

  useEffect(() => {
    setHydrated(true);
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(STORAGE_KEY_EMAIL);
      if (stored) setRecoveryEmail(stored);
    }
  }, []);

  // ---- Cart recovery from ?recover=<id> -------------------------------------
  // Fired once on mount when the URL carries a recovery token. Pulls the
  // saved cart from /api/cart/recover and adds any missing items into the
  // local Zustand store. Existing items are kept (recovery is additive,
  // not destructive), then the param is stripped so a refresh doesn't
  // re-trigger.
  const recoveryTriedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || recoveryTriedRef.current) return;
    const recoverId = searchParams.get('recover');
    if (!recoverId) return;
    recoveryTriedRef.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/cart/recover?id=${encodeURIComponent(recoverId)}`, {
          cache: 'no-store',
        });
        const data = (await res.json()) as {
          ok: boolean;
          email?: string;
          items?: Array<{
            product_id: string;
            sku: string | null;
            name: string;
            price: number;
            quantity: number;
          }>;
          recovered?: boolean;
          unsubscribed?: boolean;
        };
        if (data.ok && data.items) {
          const known = new Set(items.map((i) => i.product_id));
          for (const it of data.items) {
            if (!known.has(it.product_id)) {
              addItem(
                {
                  product_id: it.product_id,
                  sku: it.sku ?? '',
                  name: it.name,
                  slug: '',
                  brand_name: null,
                  price: it.price,
                  pack_size: null,
                  image_url: null,
                },
                it.quantity,
              );
            }
          }
          if (data.email) {
            setRecoveryEmail(data.email);
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(STORAGE_KEY_EMAIL, data.email);
            }
          }
        }
      } catch (err) {
        console.error('[cart] recovery failed', err);
      } finally {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('recover');
        const qs = params.toString();
        router.replace(qs ? `/cart?${qs}` : '/cart', { scroll: false });
      }
    })();
    // We only want this effect to fire once after hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // ---- Debounced save into abandoned_carts ----------------------------------
  // Only POST when the user has typed a valid email AND the cart has items.
  // Debounce ensures one network call after the user pauses typing rather
  // than one per keystroke. Server-side keying on email handles UPSERT.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignatureRef = useRef<string>('');
  useEffect(() => {
    if (!hydrated) return;
    if (recoveryStatus === 'unavailable') return;
    const trimmed = recoveryEmail.trim().toLowerCase();
    const validEmail = EMAIL_RE.test(trimmed);
    if (!validEmail || items.length === 0) return;

    const signature = `${trimmed}|${subtotal.toFixed(2)}|${items
      .map((i) => `${i.product_id}:${i.quantity}`)
      .join(',')}`;
    if (signature === lastSavedSignatureRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setRecoveryStatus('saving');
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/cart/save', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: trimmed,
            cart_contents: items.map((i) => ({
              product_id: i.product_id,
              sku: i.sku,
              name: i.name,
              price: i.price,
              quantity: i.quantity,
            })),
            subtotal_cents: Math.round(subtotal * 100),
          }),
        });
        if (res.status === 503) {
          setRecoveryStatus('unavailable');
          return;
        }
        const data = (await res.json()) as { ok: boolean };
        if (data.ok) {
          lastSavedSignatureRef.current = signature;
          setRecoveryStatus('saved');
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY_EMAIL, trimmed);
          }
        } else {
          setRecoveryStatus('error');
        }
      } catch (err) {
        console.error('[cart] save failed', err);
        setRecoveryStatus('error');
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // Subtotal + items + email are the inputs; recoveryStatus excluded so
    // status changes don't re-arm the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, recoveryEmail, items, subtotal]);

  const qualifiesFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const tier1 = subtotal >= VOLUME_TIER_1_THRESHOLD;
  const tier2 = subtotal >= VOLUME_TIER_2_THRESHOLD;

  return (
    <>
      {/* Page header */}
      <header className="bg-cream border-b border-rule">
        <div className="max-w-content mx-auto px-8 pt-14 pb-12 max-sm:px-5 max-sm:pt-10 max-sm:pb-10">
          <p className="type-label text-accent mb-6">§ The register</p>
          <h1 className="type-display-1 mb-6">
            Your <em className="type-accent">cart</em>.
          </h1>
          <p
            className="type-body pl-5 max-w-[480px]"
            style={{
              backgroundImage:
                'linear-gradient(to bottom, var(--color-gold) 0%, transparent 100%)',
              backgroundSize: '1px 100%',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'left top',
            }}
          >
            {!hydrated
              ? 'Reviewing your order…'
              : items.length === 0
                ? 'Empty for now.'
                : `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${items.length} ${items.length === 1 ? 'line' : 'lines'}`}
          </p>
        </div>
      </header>

      <section className="max-w-content mx-auto px-8 py-16 max-sm:px-5 max-sm:py-10">
        {hydrated && reorder.unavailableNotice && reorder.unavailableNotice.length > 0 && (
          <div
            role="status"
            className="bg-paper-2 mb-8 flex items-start justify-between gap-4 max-md:flex-col"
            style={{ border: '1px solid var(--rule)', padding: '14px 18px' }}
          >
            <p className="type-data-mono text-ink-2">
              <span className="text-accent">Some items from your previous order couldn&rsquo;t be added</span>{' '}
              — they&rsquo;re no longer available:{' '}
              <span className="text-ink">{reorder.unavailableNotice.join(' · ')}</span>.{' '}
              Your other items are below.
            </p>
            <button
              type="button"
              onClick={dismissUnavailable}
              className="type-label-sm text-ink-muted hover:text-accent shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
        {!hydrated ? (
          <p className="type-label text-ink-muted">Loading cart…</p>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-14 max-lg:gap-10 lg:grid-cols-[1.5fr_0.7fr]">
            {/* Line items */}
            <div>
              <div
                className="flex items-baseline justify-between pb-4 mb-2"
                style={{ borderBottom: '1px solid var(--rule-strong)' }}
              >
                <span className="type-label text-ink">§&nbsp;&nbsp;Line items</span>
                <span className="type-data-mono text-ink-muted">
                  {items.length} {items.length === 1 ? 'line' : 'lines'}
                </span>
              </div>
              {items.map((item) => (
                <LineRow key={item.product_id} item={item} />
              ))}
            </div>

            {/* Order summary */}
            <aside className="lg:sticky lg:top-6 self-start">
              <div
                className="bg-cream"
                style={{ border: '1px solid var(--rule-strong)', padding: '28px' }}
              >
                <p className="type-label text-ink mb-6">§&nbsp;&nbsp;Summary</p>

                <dl
                  className="flex flex-col"
                  style={{ borderTop: '1px solid var(--rule)' }}
                >
                  <SummaryRow label="Subtotal" value={<Price amount={subtotal} size={18} />} />
                  <SummaryRow
                    label="Shipping"
                    value={
                      qualifiesFreeShipping ? (
                        <span
                          className="font-display italic text-gold-bright"
                          style={{ fontSize: '16px', letterSpacing: '-0.01em', fontWeight: 500 }}
                        >
                          FREE
                        </span>
                      ) : (
                        <Price amount={shipping} size={16} />
                      )
                    }
                    note={
                      qualifiesFreeShipping
                        ? 'Continental US, orders $70+'
                        : `Add $${(FREE_SHIPPING_THRESHOLD - subtotal).toFixed(2)} more for free shipping`
                    }
                  />
                </dl>

                {(tier1 || tier2) && (
                  <div
                    className="mt-4 mb-2 flex items-center gap-2 flex-wrap"
                    style={{ paddingTop: 14, borderTop: '1px dashed var(--rule)' }}
                  >
                    {tier1 && (
                      <span
                        className="type-label-sm text-cream"
                        style={{
                          padding: '5px 9px',
                          background: 'var(--color-gold)',
                        }}
                      >
                        Volume tier 1
                      </span>
                    )}
                    {tier2 && (
                      <span
                        className="type-label-sm text-cream"
                        style={{
                          padding: '5px 9px',
                          background: 'var(--color-brand-deep)',
                        }}
                      >
                        Volume tier 2
                      </span>
                    )}
                  </div>
                )}

                {tier1 && (
                  <p
                    className="font-display italic text-brand-deep mt-4 mb-2"
                    style={{ fontSize: '13px', lineHeight: 1.5, letterSpacing: '-0.01em' }}
                  >
                    Contact us for custom pricing on orders over $400 —{' '}
                    <a
                      href="mailto:customercare@lacostagourmet.com"
                      className="underline underline-offset-[3px] hover:text-ink transition-colors duration-200"
                    >
                      customercare@lacostagourmet.com
                    </a>
                    .
                  </p>
                )}

                <div
                  className="mt-6 pt-5 flex items-baseline justify-between"
                  style={{ borderTop: '1px solid var(--rule-strong)' }}
                >
                  <span className="type-label text-ink">Total</span>
                  <Price amount={total} size={28} />
                </div>

                <div className="mt-6">
                  <label
                    htmlFor="cart-recovery-email"
                    className="type-label-sm text-ink-muted block mb-2"
                  >
                    Email (so we can save your cart)
                  </label>
                  <input
                    id="cart-recovery-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    className="w-full bg-paper font-display text-[15px] text-ink placeholder:text-ink-muted/60 focus:outline-none focus:border-brand-deep transition-colors duration-200"
                    style={{
                      border: '1px solid var(--rule-strong)',
                      padding: '12px 14px',
                    }}
                  />
                  {recoveryStatus === 'saved' && (
                    <p className="type-data-mono text-gold mt-2">
                      Saved · we&rsquo;ll email a reminder if you don&rsquo;t finish.
                    </p>
                  )}
                  {recoveryStatus === 'error' && (
                    <p className="type-data-mono text-accent mt-2">
                      We couldn&rsquo;t save your cart — try again or just check out.
                    </p>
                  )}
                </div>

                <div className="mt-4">
                  <Link
                    href="/checkout"
                    className="btn btn-solid w-full justify-center"
                    style={{ padding: '18px 26px' }}
                  >
                    <span>Checkout</span>
                    <span className="btn-arrow" aria-hidden="true">→</span>
                  </Link>
                </div>

                <p className="type-data-mono text-ink-muted text-center mt-4">
                  We accept Visa, Mastercard, American Express, and Discover.
                </p>
              </div>
            </aside>
          </div>
        )}
      </section>
    </>
  );
}

function SummaryRow({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-6 py-3.5"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <div className="flex flex-col gap-1">
        <dt className="type-label-sm text-ink">{label}</dt>
        {note && <span className="type-data-mono text-ink-muted">{note}</span>}
      </div>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
