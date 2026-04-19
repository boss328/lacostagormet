import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { STATUS_LABEL, STATUS_COLOR, type VendorOrderStatus } from '@/lib/admin/vendor-po';
import { VendorEditForm } from '@/components/admin/vendors/VendorEditForm';
import { WarehouseList } from '@/components/admin/vendors/WarehouseList';

export const dynamic = 'force-dynamic';

type Vendor = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_name: string | null;
  phone: string | null;
  terms: string | null;
  notes: string | null;
  is_active: boolean;
  is_self_fulfilled: boolean;
  email_template: string | null;
  created_at: string;
};

type Warehouse = {
  id: string;
  vendor_id: string;
  label: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  is_primary: boolean;
};

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  retail_price: number | string;
  is_active: boolean;
};

type PoRow = {
  id: string;
  status: VendorOrderStatus;
  email_subject: string | null;
  total_wholesale: number | string | null;
  created_at: string;
  email_sent_at: string | null;
  orders: { order_number: string; customer_email: string } | null;
};

export default async function VendorDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const admin = createAdminClient();

  const [{ data: vendor }, { data: warehousesData }, { data: productsData }, { data: posData }] =
    await Promise.all([
      admin
        .from('vendors')
        .select(
          'id, name, contact_email, contact_name, phone, terms, notes, is_active, is_self_fulfilled, email_template, created_at',
        )
        .eq('id', params.id)
        .maybeSingle(),
      admin
        .from('vendor_warehouses')
        .select('id, vendor_id, label, city, state, zip, is_primary')
        .eq('vendor_id', params.id)
        .order('is_primary', { ascending: false })
        .order('label', { ascending: true }),
      admin
        .from('products')
        .select('id, sku, name, retail_price, is_active')
        .eq('preferred_vendor_id', params.id)
        .order('name', { ascending: true })
        .limit(50),
      admin
        .from('vendor_orders')
        .select(
          'id, status, email_subject, total_wholesale, created_at, email_sent_at, orders(order_number, customer_email)',
        )
        .eq('vendor_id', params.id)
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

  if (!vendor) notFound();
  const v = vendor as Vendor;
  const warehouses = (warehousesData ?? []) as Warehouse[];
  const products = (productsData ?? []) as ProductRow[];
  const pos = (posData ?? []) as unknown as PoRow[];

  return (
    <>
      <Link
        href="/admin/vendors/"
        className="type-label text-ink-muted hover:text-brand-deep transition-colors duration-200 inline-block mb-5"
      >
        ← All vendors
      </Link>

      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ V. Vendor</p>
        <h1
          className="font-display text-ink"
          style={{ fontSize: '40px', lineHeight: 1, letterSpacing: '-0.026em' }}
        >
          <em className="type-accent">{v.name}</em>
        </h1>
        <p className="type-data-mono text-ink-muted mt-3">
          {v.contact_email ?? 'no contact email'}
          {v.terms ? ` · ${v.terms}` : ''}
          {v.is_self_fulfilled ? ' · self-fulfilled' : ''}
        </p>
      </header>

      <section className="grid gap-8 lg:grid-cols-[1.2fr_1fr] mb-10">
        <VendorEditForm vendor={v} />
        <WarehouseList vendorId={v.id} warehouses={warehouses} />
      </section>

      <section className="mb-10">
        <div
          className="flex items-baseline justify-between pb-3 mb-2"
          style={{ borderBottom: '1px solid var(--rule-strong)' }}
        >
          <span className="type-label text-ink">§ Products supplied</span>
          <span className="type-data-mono text-ink-muted">
            {products.length} {products.length === 1 ? 'product' : 'products'}
          </span>
        </div>
        {products.length === 0 ? (
          <p className="type-data-mono text-ink-muted py-6">
            No products list this vendor as preferred. Set the preferred vendor on a product to wire it here.
          </p>
        ) : (
          <ul className="flex flex-col">
            {products.map((p) => (
              <li
                key={p.id}
                className="grid items-baseline gap-4 py-2.5"
                style={{
                  gridTemplateColumns: 'minmax(120px,auto) 1fr auto auto',
                  borderBottom: '1px solid var(--rule)',
                }}
              >
                <span className="type-data-mono text-ink-muted">{p.sku}</span>
                <Link
                  href={`/admin/products/${p.id}/`}
                  className="font-display text-ink hover:text-brand-deep truncate"
                  style={{ fontSize: '14px' }}
                >
                  {p.name}
                </Link>
                <span className="type-data-mono text-ink">
                  ${Number(p.retail_price).toFixed(2)}
                </span>
                <span className="type-data-mono">
                  {p.is_active ? (
                    <span className="text-forest">active</span>
                  ) : (
                    <span className="text-ink-muted">inactive</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div
          className="flex items-baseline justify-between pb-3 mb-2"
          style={{ borderBottom: '1px solid var(--rule-strong)' }}
        >
          <span className="type-label text-ink">§ Recent purchase orders</span>
          <span className="type-data-mono text-ink-muted">last 25</span>
        </div>
        {pos.length === 0 ? (
          <p className="type-data-mono text-ink-muted py-6">No POs yet.</p>
        ) : (
          <ul className="flex flex-col">
            {pos.map((p) => (
              <li
                key={p.id}
                className="grid items-baseline gap-4 py-2.5"
                style={{
                  gridTemplateColumns: 'minmax(140px,auto) 1fr auto auto auto',
                  borderBottom: '1px solid var(--rule)',
                }}
              >
                <span className="type-data-mono text-ink-muted">
                  {new Date(p.created_at).toLocaleDateString('en-US')}
                </span>
                <Link
                  href={`/admin/purchase-orders/${p.id}/`}
                  className="font-display italic text-brand-deep hover:opacity-80 truncate"
                  style={{ fontSize: '14.5px', fontWeight: 500 }}
                >
                  {p.orders?.order_number ?? '—'} · {p.email_subject ?? '(no subject)'}
                </Link>
                <span
                  className="type-label-sm text-cream"
                  style={{ padding: '3px 8px', background: STATUS_COLOR[p.status] }}
                >
                  {STATUS_LABEL[p.status]}
                </span>
                <span className="type-data-mono text-ink-muted">
                  {p.total_wholesale != null ? `$${Number(p.total_wholesale).toFixed(2)}` : '—'}
                </span>
                <span className="type-data-mono text-ink-muted truncate">
                  {p.orders?.customer_email ?? ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
