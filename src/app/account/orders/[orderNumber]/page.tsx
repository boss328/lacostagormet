import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/auth-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { ReorderButton } from '@/components/orders/ReorderButton';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  customer_email: string;
  subtotal: number | string;
  shipping_cost: number | string;
  tax: number | string;
  total: number | string;
  created_at: string;
  shipping_address: {
    first_name?: string;
    last_name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
  };
};

type OrderItemRow = {
  product_sku: string;
  product_name: string;
  quantity: number;
  unit_price: number | string;
  line_subtotal: number | string;
};

function fmt(v: number | string): string {
  const n = typeof v === 'string' ? Number(v) : v;
  return `$${n.toFixed(2)}`;
}

export default async function AccountOrderDetailPage({
  params,
}: {
  params: { orderNumber: string };
}) {
  const user = await getSessionUser();
  const email = user?.email ?? '';
  const admin = createAdminClient();

  const { data: order } = await admin
    .from('orders')
    .select(
      'id, order_number, status, customer_email, subtotal, shipping_cost, tax, total, created_at, shipping_address',
    )
    .eq('order_number', params.orderNumber)
    .eq('customer_email', email)
    .maybeSingle();

  if (!order) notFound();
  const o = order as OrderRow;

  const { data: items } = await admin
    .from('order_items')
    .select('product_sku, product_name, quantity, unit_price, line_subtotal')
    .eq('order_id', o.id);

  const rows = (items ?? []) as OrderItemRow[];

  return (
    <>
      <header className="mb-10">
        <p className="type-label text-accent mb-5">§ Order detail</p>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="type-display-2">
              <em className="type-accent">{o.order_number}</em>
            </h1>
            <p className="type-data-mono text-ink-muted mt-4">
              {new Date(o.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              {' · '}
              {o.status.replace(/_/g, ' ')}
            </p>
          </div>
          <ReorderButton orderNumber={o.order_number} variant="solid" />
        </div>
      </header>

      <div className="grid gap-10 max-lg:gap-8 lg:grid-cols-[1.5fr_0.8fr]">
        <div>
          <div
            className="flex items-baseline justify-between pb-4 mb-2"
            style={{ borderBottom: '1px solid var(--rule-strong)' }}
          >
            <span className="type-label text-ink">§&nbsp;&nbsp;What was ordered</span>
            <span className="type-data-mono text-ink-muted">
              {rows.length} {rows.length === 1 ? 'line' : 'lines'}
            </span>
          </div>
          {rows.map((row, idx) => (
            <div
              key={`${row.product_sku}-${idx}`}
              className="py-5"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <div className="flex justify-between items-baseline gap-4">
                <div className="min-w-0">
                  <p className="type-data-mono text-ink-muted">{row.product_sku}</p>
                  <p className="type-product text-ink mt-1">{row.product_name}</p>
                  <p className="type-data-mono text-brand mt-1">
                    qty {row.quantity} · {fmt(row.unit_price)} ea
                  </p>
                </div>
                <span
                  className="font-display italic text-brand-deep shrink-0"
                  style={{ fontSize: '18px', fontWeight: 500, letterSpacing: '-0.01em' }}
                >
                  {fmt(row.line_subtotal)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <aside className="flex flex-col gap-5">
          <div
            className="bg-cream"
            style={{ border: '1px solid var(--rule-strong)', padding: '24px 26px' }}
          >
            <p className="type-label text-ink mb-5">§&nbsp;&nbsp;Ship to</p>
            <address className="font-display text-ink not-italic" style={{ fontSize: '15px', lineHeight: 1.55 }}>
              {o.shipping_address.first_name} {o.shipping_address.last_name}
              <br />
              {o.shipping_address.address1}
              {o.shipping_address.address2 && (
                <>
                  <br />
                  {o.shipping_address.address2}
                </>
              )}
              <br />
              {o.shipping_address.city}
              {o.shipping_address.city && ', '}
              {o.shipping_address.state} {o.shipping_address.zip}
            </address>
          </div>

          <div
            className="bg-cream"
            style={{ border: '1px solid var(--rule-strong)', padding: '24px 26px' }}
          >
            <p className="type-label text-ink mb-5">§&nbsp;&nbsp;Totals</p>
            <dl className="flex flex-col" style={{ borderTop: '1px solid var(--rule)' }}>
              <Row label="Subtotal" value={fmt(o.subtotal)} />
              <Row label="Shipping" value={Number(o.shipping_cost) === 0 ? 'FREE' : fmt(o.shipping_cost)} />
              {Number(o.tax) > 0 && <Row label="Tax" value={fmt(o.tax)} />}
            </dl>
            <div
              className="flex items-baseline justify-between pt-4 mt-2"
              style={{ borderTop: '1px solid var(--rule-strong)' }}
            >
              <span className="type-label text-ink">Total</span>
              <span
                className="font-display italic text-brand-deep"
                style={{ fontSize: '22px', fontWeight: 500, letterSpacing: '-0.015em' }}
              >
                {fmt(o.total)}
              </span>
            </div>
          </div>

          <Link
            href="/account/orders"
            className="type-label text-ink hover:text-brand-deep transition-colors duration-200"
          >
            ←&nbsp;All orders
          </Link>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-6 py-3"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <dt className="type-label-sm text-ink">{label}</dt>
      <dd className="type-data-mono text-ink">{value}</dd>
    </div>
  );
}
