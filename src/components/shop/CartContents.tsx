'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import {
  useCartStore,
  selectSubtotal,
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

const SHIPPING_STANDARD = 12.99;

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

export function CartContents() {
  const [hydrated, setHydrated] = useState(false);
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore(selectSubtotal);
  const itemCount = useCartStore(selectItemCount);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const qualifiesFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const tier1 = subtotal >= VOLUME_TIER_1_THRESHOLD;
  const tier2 = subtotal >= VOLUME_TIER_2_THRESHOLD;
  const shipping = qualifiesFreeShipping || items.length === 0 ? 0 : SHIPPING_STANDARD;
  const total = subtotal + shipping;

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
                        <Price amount={SHIPPING_STANDARD} size={16} />
                      )
                    }
                    note={
                      qualifiesFreeShipping
                        ? 'Orders over $70 · continental US'
                        : `Add ${(FREE_SHIPPING_THRESHOLD - subtotal).toFixed(2)} for free ground`
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
                      href="mailto:info@lacostagourmet.com"
                      className="underline underline-offset-[3px] hover:text-ink transition-colors duration-200"
                    >
                      info@lacostagourmet.com
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
                  <Link
                    href="/checkout"
                    className="btn btn-solid w-full justify-center"
                    style={{ padding: '18px 26px' }}
                  >
                    <span>Checkout</span>
                    <span className="btn-arrow" aria-hidden="true">→</span>
                  </Link>
                </div>
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
