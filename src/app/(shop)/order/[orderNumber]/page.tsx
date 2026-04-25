import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { Button } from '@/components/design-system/Button';
import { formatPackSize } from '@/lib/pack-size';
import { bcImage } from '@/lib/bcImage';

type Params = { orderNumber: string };

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  customer_email: string;
  subtotal: number | string;
  shipping_cost: number | string;
  tax: number | string;
  total: number | string;
  shipping_address: {
    first_name: string;
    last_name: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    zip: string;
    phone?: string;
  };
  created_at: string;
};

type OrderItemRow = {
  product_id: string | null;
  product_sku: string;
  product_name: string;
  quantity: number;
  unit_price: number | string;
  line_subtotal: number | string;
  products: {
    slug: string | null;
    pack_size: string | null;
    product_images: Array<{ url: string; is_primary: boolean; display_order: number }> | null;
  } | null;
};

type PaymentRow = {
  status: string;
  card_last_four: string | null;
  card_brand: string | null;
};

const CREAM_BG =
  'radial-gradient(ellipse at center, var(--color-cream) 0%, var(--color-paper-2) 115%)';

const VIEWABLE_STATUSES = new Set(['paid', 'payment_held', 'pending']);

async function fetchOrder(orderNumber: string): Promise<{
  order: OrderRow;
  items: OrderItemRow[];
  payment: PaymentRow | null;
} | null> {
  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select(
      'id, order_number, status, customer_email, subtotal, shipping_cost, tax, total, shipping_address, created_at',
    )
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (orderErr || !order) return null;
  if (!VIEWABLE_STATUSES.has((order as OrderRow).status)) return null;

  const { data: items } = await admin
    .from('order_items')
    .select(
      'product_id, product_sku, product_name, quantity, unit_price, line_subtotal, products(slug, pack_size, product_images(url, is_primary, display_order))',
    )
    .eq('order_id', (order as OrderRow).id);

  const { data: payments } = await admin
    .from('payments')
    .select('status, card_last_four, card_brand')
    .eq('order_id', (order as OrderRow).id)
    .order('created_at', { ascending: false })
    .limit(1);

  const payment = ((payments ?? [])[0] as PaymentRow | undefined) ?? null;

  return {
    order: order as OrderRow,
    items: (items ?? []) as unknown as OrderItemRow[],
    payment,
  };
}

type ProductImage = { url: string; is_primary: boolean; display_order: number };

function pickPrimary(images: ProductImage[] | null): { url: string } | null {
  if (!images || images.length === 0) return null;
  const primary =
    images.find((i) => i.is_primary) ??
    [...images].sort((a, b) => a.display_order - b.display_order)[0];
  return primary ? { url: primary.url } : null;
}

function splitPrice(v: number | string): { dollars: string; cents: string } {
  const n = typeof v === 'string' ? Number(v) : v;
  const [d, c = '00'] = n.toFixed(2).split('.');
  return { dollars: d, cents: c.padEnd(2, '0').slice(0, 2) };
}

function Price({ amount, size = 22 }: { amount: number | string; size?: number }) {
  const { dollars, cents } = splitPrice(amount);
  return (
    <span className="type-price" style={{ fontSize: `${size}px`, lineHeight: 1 }}>
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

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return {
    title: `Order ${params.orderNumber}`,
    description: 'Your La Costa Gourmet order confirmation.',
    robots: { index: false, follow: false },
  };
}

export default async function OrderConfirmationPage({ params }: { params: Params }) {
  const data = await fetchOrder(params.orderNumber);
  if (!data) notFound();

  const { order, items, payment } = data;
  const held = order.status === 'payment_held';

  return (
    <>
      {/* Header — cream band, big order number */}
      <header className="bg-cream border-b border-rule">
        <div className="max-w-content mx-auto px-8 pt-14 pb-12 max-sm:px-5 max-sm:pt-10 max-sm:pb-10">
          <p className="type-label text-accent mb-6">§ Receipt of order</p>
          <h1 className="type-display-1 mb-6">
            Thank <em className="type-accent">you</em>.
          </h1>
          <p
            className="type-body pl-5 max-w-[560px] mb-8"
            style={{
              backgroundImage:
                'linear-gradient(to bottom, var(--color-gold) 0%, transparent 100%)',
              backgroundSize: '1px 100%',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'left top',
            }}
          >
            {held
              ? "We've received your order and are doing a quick review of the payment — you'll hear from us within a business day."
              : 'Your order is in. We\u2019ll be in touch with tracking as soon as it leaves Carlsbad.'}
          </p>

          <div
            className="inline-flex items-baseline gap-4 pt-5"
            style={{ borderTop: '1px solid var(--rule-strong)' }}
          >
            <span className="type-label text-ink-muted">Order</span>
            <span
              className="font-display italic text-brand-deep"
              style={{
                fontSize: '40px',
                lineHeight: 1,
                letterSpacing: '-0.025em',
                fontWeight: 500,
              }}
            >
              {order.order_number}
            </span>
          </div>
        </div>
      </header>

      <section className="max-w-content mx-auto px-8 py-16 max-sm:px-5 max-sm:py-10">
        <div className="grid gap-14 max-lg:gap-10 lg:grid-cols-[1.5fr_0.7fr]">
          {/* Left — line items */}
          <div>
            <div
              className="flex items-baseline justify-between pb-4 mb-2"
              style={{ borderBottom: '1px solid var(--rule-strong)' }}
            >
              <span className="type-label text-ink">§&nbsp;&nbsp;What you ordered</span>
              <span className="type-data-mono text-ink-muted">
                {items.length} {items.length === 1 ? 'line' : 'lines'}
              </span>
            </div>
            {items.map((item) => {
              const primary = pickPrimary(item.products?.product_images ?? null);
              const imgUrl = primary ? bcImage(primary.url, 'mid') : null;
              const pack = formatPackSize(item.products?.pack_size ?? null);
              const productHref = item.products?.slug ? `/product/${item.products.slug}` : null;

              return (
                <div
                  key={`${item.product_sku}-${item.quantity}`}
                  className="grid items-center gap-5 py-6 max-sm:gap-3"
                  style={{
                    gridTemplateColumns: '80px 1fr auto',
                    borderBottom: '1px solid var(--rule)',
                  }}
                >
                  <div
                    className="relative overflow-hidden"
                    style={{
                      width: 80,
                      height: 80,
                      background: CREAM_BG,
                      border: '1px solid var(--rule)',
                    }}
                  >
                    {imgUrl ? (
                      <div className="absolute inset-0" style={{ padding: 6 }}>
                        <Image
                          src={imgUrl}
                          alt=""
                          width={160}
                          height={160}
                          sizes="80px"
                          className="w-full h-full object-contain img-product"
                        />
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="type-data-mono text-ink-muted">{item.product_sku}</span>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex flex-col gap-1">
                    <span className="type-data-mono text-ink-muted">{item.product_sku}</span>
                    {productHref ? (
                      <Link
                        href={productHref}
                        className="type-product text-ink hover:text-brand-deep transition-colors duration-200 line-clamp-2"
                      >
                        {item.product_name}
                      </Link>
                    ) : (
                      <span className="type-product text-ink line-clamp-2">
                        {item.product_name}
                      </span>
                    )}
                    <span className="type-data-mono text-brand">
                      {pack ? `${pack} · ` : ''}qty {item.quantity}
                    </span>
                  </div>

                  <div className="text-right shrink-0 min-w-[90px]">
                    <Price amount={item.line_subtotal} size={18} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right — shipping + totals */}
          <aside className="lg:sticky lg:top-6 self-start flex flex-col gap-5">
            <div
              className="bg-cream"
              style={{ border: '1px solid var(--rule-strong)', padding: '24px 26px' }}
            >
              <p className="type-label text-ink mb-5">§&nbsp;&nbsp;Shipping to</p>
              <address className="font-display text-ink not-italic" style={{ fontSize: '15px', lineHeight: 1.55 }}>
                {order.shipping_address.first_name} {order.shipping_address.last_name}
                <br />
                {order.shipping_address.address1}
                {order.shipping_address.address2 && (
                  <>
                    <br />
                    {order.shipping_address.address2}
                  </>
                )}
                <br />
                {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}
                {order.shipping_address.phone && (
                  <>
                    <br />
                    <span className="type-data-mono text-ink-muted">{order.shipping_address.phone}</span>
                  </>
                )}
              </address>
              <p className="type-data-mono text-ink-muted mt-5">
                Confirmation sent to {order.customer_email}
              </p>
            </div>

            <div
              className="bg-cream"
              style={{ border: '1px solid var(--rule-strong)', padding: '24px 26px' }}
            >
              <p className="type-label text-ink mb-5">§&nbsp;&nbsp;Payment</p>
              <dl className="flex flex-col" style={{ borderTop: '1px solid var(--rule)' }}>
                <Row label="Subtotal" value={<Price amount={order.subtotal} size={16} />} />
                <Row
                  label="Shipping"
                  value={
                    Number(order.shipping_cost) === 0 ? (
                      <span
                        className="font-display italic text-gold-bright"
                        style={{ fontSize: '15px', letterSpacing: '-0.01em', fontWeight: 500 }}
                      >
                        FREE
                      </span>
                    ) : (
                      <Price amount={order.shipping_cost} size={15} />
                    )
                  }
                />
              </dl>
              <div
                className="flex items-baseline justify-between pt-4 mt-2"
                style={{ borderTop: '1px solid var(--rule-strong)' }}
              >
                <span className="type-label text-ink">Total</span>
                <Price amount={order.total} size={24} />
              </div>
              {payment?.card_last_four && (
                <p className="type-data-mono text-ink-muted mt-4">
                  {payment.card_brand ? `${payment.card_brand} ` : 'Card '}ending in{' '}
                  {payment.card_last_four}
                </p>
              )}
              <p className="type-data-mono text-ink-muted mt-3">
                Email receipt coming soon — Phase 5
              </p>
            </div>

            <Button variant="outline" arrow href="/shop">
              Continue shopping
            </Button>
          </aside>
        </div>
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="flex items-baseline justify-between gap-6 py-3"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <dt className="type-label-sm text-ink">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

export const dynamic = 'force-dynamic';
