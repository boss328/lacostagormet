import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { STATUS_LABEL, STATUS_COLOR, type VendorOrderStatus } from '@/lib/admin/vendor-po';
import { PoEditor } from '@/components/admin/purchase-orders/PoEditor';

export const dynamic = 'force-dynamic';

type Po = {
  id: string;
  order_id: string;
  vendor_id: string | null;
  warehouse_id: string | null;
  status: VendorOrderStatus;
  email_subject: string | null;
  email_body: string | null;
  email_sent_at: string | null;
  sent_by: string | null;
  total_wholesale: number | string | null;
  created_at: string;
  vendor: { id: string; name: string; contact_email: string | null; terms: string | null } | null;
  order: {
    id: string;
    order_number: string;
    customer_email: string;
    total: number | string;
    shipping_address: Record<string, string | undefined>;
  } | null;
  warehouse: { id: string; label: string } | null;
};

export default async function PoDetailPage({ params }: { params: { id: string } }) {
  const admin = createAdminClient();
  const { data: poData } = await admin
    .from('vendor_orders')
    .select(
      'id, order_id, vendor_id, warehouse_id, status, email_subject, email_body, email_sent_at, sent_by, total_wholesale, created_at, vendor:vendors(id, name, contact_email, terms), order:orders(id, order_number, customer_email, total, shipping_address), warehouse:vendor_warehouses(id, label)',
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!poData) notFound();
  const po = poData as unknown as Po;

  const [{ data: itemsData }, { data: warehouseList }] = await Promise.all([
    po.order?.id
      ? admin
          .from('order_items')
          .select('product_sku, product_name, quantity, unit_price, unit_wholesale_cost, line_subtotal')
          .eq('order_id', po.order.id)
          .eq('assigned_vendor_id', po.vendor_id ?? '')
      : Promise.resolve({ data: [] as unknown[] }),
    po.vendor_id
      ? admin
          .from('vendor_warehouses')
          .select('id, label, city, state, is_primary')
          .eq('vendor_id', po.vendor_id)
          .order('is_primary', { ascending: false })
          .order('label', { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  type Item = {
    product_sku: string;
    product_name: string;
    quantity: number;
    unit_price: number | string;
    unit_wholesale_cost: number | string | null;
    line_subtotal: number | string;
  };
  const items = (itemsData ?? []) as Item[];
  const warehouses = (warehouseList ?? []) as Array<{
    id: string;
    label: string;
    city: string | null;
    state: string | null;
    is_primary: boolean;
  }>;

  const customerTotal = po.order ? Number(po.order.total) : 0;
  const wholesale = Number(po.total_wholesale ?? 0);
  const margin =
    customerTotal > 0 && wholesale > 0
      ? Math.round(((customerTotal - wholesale) / customerTotal) * 100)
      : null;

  return (
    <>
      <Link
        href="/admin/purchase-orders"
        className="type-label text-ink-muted hover:text-brand-deep transition-colors duration-200 inline-block mb-5"
      >
        ← All POs
      </Link>

      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ VI. Purchase Order</p>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h1
            className="font-display text-ink"
            style={{ fontSize: '38px', lineHeight: 1, letterSpacing: '-0.025em' }}
          >
            <em className="type-accent">PO {po.order?.order_number ?? '—'}</em>
            <span className="type-data-mono text-ink-muted ml-3" style={{ fontSize: '14px' }}>
              {po.vendor?.name ?? 'unassigned vendor'}
            </span>
          </h1>
          <div className="flex items-center gap-4">
            <span
              className="type-label-sm text-cream"
              style={{ padding: '4px 10px', background: STATUS_COLOR[po.status] }}
            >
              {STATUS_LABEL[po.status]}
            </span>
            <span className="type-data-mono text-ink-muted">
              Created {new Date(po.created_at).toLocaleString('en-US')}
            </span>
          </div>
        </div>
      </header>

      <section className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <PoEditor
          poId={po.id}
          status={po.status}
          subject={po.email_subject ?? ''}
          body={po.email_body ?? ''}
          warehouseId={po.warehouse_id}
          warehouses={warehouses}
          items={items}
          vendorEmail={po.vendor?.contact_email ?? null}
        />

        <aside className="flex flex-col gap-5">
          <Card title="Linked order">
            <p
              className="font-display italic text-brand-deep mb-2"
              style={{ fontSize: '20px', fontWeight: 500 }}
            >
              <Link href={`/admin/orders/${po.order?.order_number}`} className="hover:opacity-80">
                {po.order?.order_number}
              </Link>
            </p>
            <p className="type-data-mono text-ink-muted">{po.order?.customer_email}</p>
            <p className="type-data-mono text-ink mt-3">
              Customer total: ${Number(po.order?.total ?? 0).toFixed(2)}
            </p>
          </Card>

          <Card title="Vendor">
            <p
              className="font-display italic text-brand-deep mb-2"
              style={{ fontSize: '18px', fontWeight: 500 }}
            >
              <Link href={`/admin/vendors/${po.vendor?.id}`} className="hover:opacity-80">
                {po.vendor?.name ?? 'unassigned'}
              </Link>
            </p>
            <p className="type-data-mono text-ink-muted">
              {po.vendor?.contact_email ?? 'no contact email'}
            </p>
            {po.vendor?.terms && (
              <p className="type-data-mono text-ink-muted">{po.vendor.terms}</p>
            )}
          </Card>

          <Card title="Internal totals" eyebrow="Not in vendor email">
            <Row label="Customer paid" value={`$${customerTotal.toFixed(2)}`} />
            <Row label="Wholesale total" value={`$${wholesale.toFixed(2)}`} />
            <Row label="Margin" value={margin === null ? '—' : `${margin}%`} accent={margin !== null && margin >= 30} />
          </Card>

          {po.email_sent_at && (
            <Card title="Send history">
              <p className="type-data-mono text-ink-muted">
                Sent {new Date(po.email_sent_at).toLocaleString('en-US')}
              </p>
              {po.sent_by && (
                <p className="type-data-mono text-ink-muted">by {po.sent_by}</p>
              )}
            </Card>
          )}
        </aside>
      </section>
    </>
  );
}

function Card({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-cream"
      style={{ border: '1px solid var(--rule-strong)', padding: '20px 22px' }}
    >
      <div className="flex items-baseline justify-between mb-4">
        <p className="type-label text-ink">§ {title}</p>
        {eyebrow && <p className="type-data-mono text-ink-muted">{eyebrow}</p>}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="flex items-baseline justify-between py-2"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <span className="type-label-sm text-ink">{label}</span>
      <span
        className="type-data-mono"
        style={{ color: accent ? 'var(--color-forest)' : 'var(--color-ink)' }}
      >
        {value}
      </span>
    </div>
  );
}
