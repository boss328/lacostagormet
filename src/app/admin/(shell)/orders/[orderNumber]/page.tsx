import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminOrderStatusButtons } from '@/components/admin/AdminOrderStatusButtons';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  fulfillment_status: string;
  customer_email: string;
  customer_id: string | null;
  subtotal: number | string;
  shipping_cost: number | string;
  tax: number | string;
  total: number | string;
  shipping_address: Record<string, string | undefined>;
  billing_address: Record<string, string | undefined>;
  admin_notes: string | null;
  source: string;
  legacy_bc_order_id: string | null;
  created_at: string;
};

type OrderItemRow = {
  product_sku: string;
  product_name: string;
  quantity: number;
  unit_price: number | string;
  line_subtotal: number | string;
};

type PaymentRow = {
  type: string;
  status: string;
  amount: number | string;
  authnet_transaction_id: string | null;
  authnet_response_code: string | null;
  authnet_response_reason: string | null;
  card_last_four: string | null;
  card_brand: string | null;
  created_at: string;
};

function fmtMoney(v: number | string): string {
  const n = typeof v === 'string' ? Number(v) : v;
  return `$${n.toFixed(2)}`;
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: { orderNumber: string };
}) {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select(
      'id, order_number, status, fulfillment_status, customer_email, customer_id, subtotal, shipping_cost, tax, total, shipping_address, billing_address, admin_notes, source, legacy_bc_order_id, created_at',
    )
    .eq('order_number', params.orderNumber)
    .maybeSingle();

  if (!order) notFound();
  const o = order as OrderRow;

  const [{ data: items }, { data: payments }] = await Promise.all([
    admin
      .from('order_items')
      .select('product_sku, product_name, quantity, unit_price, line_subtotal')
      .eq('order_id', o.id),
    admin
      .from('payments')
      .select(
        'type, status, amount, authnet_transaction_id, authnet_response_code, authnet_response_reason, card_last_four, card_brand, created_at',
      )
      .eq('order_id', o.id)
      .order('created_at', { ascending: false }),
  ]);

  const itemRows = (items ?? []) as OrderItemRow[];
  const paymentRows = (payments ?? []) as PaymentRow[];

  return (
    <>
      <Link
        href="/admin/orders"
        className="type-label text-ink-muted hover:text-brand-deep transition-colors duration-200 inline-block mb-5"
      >
        ←&nbsp;All orders
      </Link>

      <header className="mb-8">
        <p className="type-label text-accent mb-3">§ Order</p>
        <h1 className="type-display-2">
          <em className="type-accent">{o.order_number}</em>
        </h1>
        <p className="type-data-mono text-ink-muted mt-3">
          {new Date(o.created_at).toLocaleString('en-US')}
          {' · '}
          {o.source}
          {o.legacy_bc_order_id ? ` · BC #${o.legacy_bc_order_id}` : ''}
        </p>
      </header>

      <section className="grid gap-4 max-lg:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatBlock label="Order status" value={o.status.replace(/_/g, ' ')} />
        <StatBlock label="Fulfilment" value={o.fulfillment_status.replace(/_/g, ' ')} />
        <StatBlock label="Total" value={fmtMoney(o.total)} />
        <StatBlock label="Customer" value={o.customer_email} compact />
      </section>

      <AdminOrderStatusButtons orderNumber={o.order_number} status={o.status} fulfillmentStatus={o.fulfillment_status} />

      <section className="mt-10 grid gap-8 max-lg:gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <div
            className="flex items-baseline justify-between pb-3 mb-2"
            style={{ borderBottom: '1px solid var(--rule-strong)' }}
          >
            <span className="type-label text-ink">§&nbsp;&nbsp;Line items</span>
            <span className="type-data-mono text-ink-muted">
              {itemRows.length} {itemRows.length === 1 ? 'line' : 'lines'}
            </span>
          </div>
          {itemRows.length === 0 ? (
            <p className="type-data-mono text-ink-muted py-6">No line items recorded.</p>
          ) : (
            itemRows.map((row, i) => (
              <div
                key={`${row.product_sku}-${i}`}
                className="grid items-baseline gap-4 py-3"
                style={{
                  gridTemplateColumns: 'minmax(120px,auto) 1fr auto auto',
                  borderBottom: '1px solid var(--rule)',
                }}
              >
                <span className="type-data-mono text-ink-muted">{row.product_sku}</span>
                <span className="font-display text-ink truncate" style={{ fontSize: '15px' }}>
                  {row.product_name}
                </span>
                <span className="type-data-mono text-brand">
                  qty {row.quantity} · {fmtMoney(row.unit_price)}
                </span>
                <span
                  className="font-display italic text-brand-deep text-right"
                  style={{ fontSize: '16px', fontWeight: 500, letterSpacing: '-0.015em' }}
                >
                  {fmtMoney(row.line_subtotal)}
                </span>
              </div>
            ))
          )}

          <div
            className="mt-6 p-5"
            style={{ background: 'var(--color-cream)', border: '1px solid var(--rule)' }}
          >
            <dl className="flex flex-col" style={{ borderTop: '1px solid var(--rule)' }}>
              <Row label="Subtotal" value={fmtMoney(o.subtotal)} />
              <Row label="Shipping" value={fmtMoney(o.shipping_cost)} />
              {Number(o.tax) > 0 && <Row label="Tax" value={fmtMoney(o.tax)} />}
            </dl>
            <div
              className="flex items-baseline justify-between pt-3 mt-2"
              style={{ borderTop: '1px solid var(--rule-strong)' }}
            >
              <span className="type-label text-ink">Total</span>
              <span
                className="font-display italic text-brand-deep"
                style={{ fontSize: '22px', fontWeight: 500, letterSpacing: '-0.015em' }}
              >
                {fmtMoney(o.total)}
              </span>
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-5">
          <div
            className="bg-cream"
            style={{ border: '1px solid var(--rule-strong)', padding: '20px 22px' }}
          >
            <p className="type-label text-ink mb-4">§&nbsp;&nbsp;Ship to</p>
            <address className="font-display text-ink not-italic" style={{ fontSize: '14px', lineHeight: 1.55 }}>
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
              {o.shipping_address.city}, {o.shipping_address.state} {o.shipping_address.zip}
              {o.shipping_address.phone && (
                <>
                  <br />
                  <span className="type-data-mono text-ink-muted">{o.shipping_address.phone}</span>
                </>
              )}
            </address>
          </div>

          {paymentRows.length > 0 && (
            <div
              className="bg-cream"
              style={{ border: '1px solid var(--rule-strong)', padding: '20px 22px' }}
            >
              <p className="type-label text-ink mb-4">§&nbsp;&nbsp;Payment</p>
              {paymentRows.map((p, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2"
                  style={{
                    paddingTop: i > 0 ? 12 : 0,
                    borderTop: i > 0 ? '1px dashed var(--rule)' : undefined,
                    paddingBottom: 12,
                  }}
                >
                  <p className="font-display text-ink" style={{ fontSize: '15px' }}>
                    {fmtMoney(p.amount)} · {p.type} · {p.status}
                  </p>
                  {p.authnet_transaction_id && (
                    <p className="type-data-mono text-ink-muted">
                      TX {p.authnet_transaction_id}
                    </p>
                  )}
                  {p.card_last_four && (
                    <p className="type-data-mono text-ink-muted">
                      {p.card_brand ?? 'Card'} ending {p.card_last_four}
                    </p>
                  )}
                  {p.authnet_response_reason && (
                    <p className="type-data-mono text-ink-muted">
                      {p.authnet_response_reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {o.admin_notes && (
            <div
              className="bg-paper-2"
              style={{ border: '1px solid var(--rule)', padding: '18px 20px' }}
            >
              <p className="type-label-sm text-ink mb-3">§&nbsp;&nbsp;Admin notes</p>
              <p
                className="font-display text-ink"
                style={{ fontSize: '14px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
              >
                {o.admin_notes}
              </p>
            </div>
          )}
        </aside>
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-baseline justify-between py-2"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <dt className="type-label-sm text-ink">{label}</dt>
      <dd className="type-data-mono text-ink">{value}</dd>
    </div>
  );
}

function StatBlock({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      className="bg-cream"
      style={{ border: '1px solid var(--rule-strong)', padding: '14px 16px' }}
    >
      <p className="type-label-sm text-ink-muted mb-2">{label}</p>
      <p
        className={compact ? 'font-display text-ink truncate' : 'font-display italic text-brand-deep'}
        style={
          compact
            ? { fontSize: '14px' }
            : { fontSize: '22px', fontWeight: 500, letterSpacing: '-0.018em', lineHeight: 1 }
        }
      >
        {value}
      </p>
    </div>
  );
}
