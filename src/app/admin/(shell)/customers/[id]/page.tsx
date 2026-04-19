import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type CustomerRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  phone: string | null;
  migrated_from_bc: boolean;
  legacy_bc_customer_id: string | null;
  created_at: string;
};

type AddressRow = {
  id: string;
  first_name: string;
  last_name: string;
  street1: string;
  street2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string | null;
};

type OrderRow = {
  order_number: string;
  status: string;
  total: number | string;
  created_at: string;
};

function fmtMoney(v: number | string): string {
  const n = typeof v === 'string' ? Number(v) : v;
  return `$${n.toFixed(2)}`;
}

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const admin = createAdminClient();

  const { data: customer } = await admin
    .from('customers')
    .select(
      'id, email, first_name, last_name, company_name, phone, migrated_from_bc, legacy_bc_customer_id, created_at',
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!customer) notFound();
  const c = customer as CustomerRow;

  const [addrRes, orderRes] = await Promise.all([
    admin
      .from('addresses')
      .select('id, first_name, last_name, street1, street2, city, state, postal_code, country, phone')
      .eq('customer_id', c.id),
    admin
      .from('orders')
      .select('order_number, status, total, created_at')
      .eq('customer_email', c.email)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  const addresses = (addrRes.data ?? []) as AddressRow[];
  const orders = (orderRes.data ?? []) as OrderRow[];

  const lifetime = orders
    .filter((o) => o.status === 'paid' || o.status === 'payment_held')
    .reduce((sum, o) => sum + Number(o.total), 0);

  return (
    <>
      <Link
        href="/admin/customers"
        className="type-label text-ink-muted hover:text-brand-deep transition-colors duration-200 inline-block mb-5"
      >
        ←&nbsp;All customers
      </Link>

      <header className="mb-8">
        <p className="type-label text-accent mb-3">§ Customer</p>
        <h1 className="type-display-2">
          {[c.first_name, c.last_name].filter(Boolean).join(' ') || (
            <em className="type-accent">Unnamed</em>
          )}
        </h1>
        <p className="type-data-mono text-ink-muted mt-3">
          {c.email}
          {c.company_name ? ` · ${c.company_name}` : ''}
          {c.migrated_from_bc ? ' · migrated from BC' : ''}
        </p>
      </header>

      <section className="grid gap-4 max-lg:grid-cols-2 lg:grid-cols-4 mb-10">
        <StatBlock label="Lifetime value" value={fmtMoney(lifetime)} />
        <StatBlock label="Orders" value={String(orders.length)} />
        <StatBlock label="Phone" value={c.phone ?? '—'} compact />
        <StatBlock label="Added" value={new Date(c.created_at).toLocaleDateString('en-US')} compact />
      </section>

      <section className="grid gap-8 max-lg:gap-6 lg:grid-cols-[1fr_1fr] mb-10">
        <div>
          <p
            className="type-label text-ink pb-3 mb-3"
            style={{ borderBottom: '1px solid var(--rule-strong)' }}
          >
            §&nbsp;&nbsp;Addresses
          </p>
          {addresses.length === 0 ? (
            <p className="type-data-mono text-ink-muted py-3">None on file.</p>
          ) : (
            <div className="grid gap-3">
              {addresses.map((a) => (
                <div
                  key={a.id}
                  className="bg-cream"
                  style={{ border: '1px solid var(--rule)', padding: '14px 16px' }}
                >
                  <p className="font-display text-ink" style={{ fontSize: '14px', lineHeight: 1.55 }}>
                    {a.first_name} {a.last_name}
                    <br />
                    {a.street1}
                    {a.street2 ? (
                      <>
                        <br />
                        {a.street2}
                      </>
                    ) : null}
                    <br />
                    {a.city}, {a.state} {a.postal_code}
                  </p>
                  {a.phone && <p className="type-data-mono text-ink-muted mt-2">{a.phone}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p
            className="type-label text-ink pb-3 mb-3"
            style={{ borderBottom: '1px solid var(--rule-strong)' }}
          >
            §&nbsp;&nbsp;Order history
          </p>
          {orders.length === 0 ? (
            <p className="type-data-mono text-ink-muted py-3">No orders yet.</p>
          ) : (
            <div>
              {orders.map((o) => (
                <Link
                  key={o.order_number}
                  href={`/admin/orders/${o.order_number}`}
                  className="flex items-baseline justify-between gap-3 py-2 hover:bg-paper-2 transition-colors duration-200"
                  style={{ borderBottom: '1px solid var(--rule)', paddingLeft: 6, paddingRight: 6 }}
                >
                  <span
                    className="font-display italic text-brand-deep"
                    style={{ fontSize: '15px', fontWeight: 500, letterSpacing: '-0.015em' }}
                  >
                    {o.order_number}
                  </span>
                  <span className="type-data-mono text-ink-muted flex-1 mx-3 truncate text-right">
                    {o.status.replace(/_/g, ' ')}
                  </span>
                  <span className="font-display text-ink" style={{ fontSize: '14px' }}>
                    {fmtMoney(o.total)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
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
    <div className="bg-cream" style={{ border: '1px solid var(--rule-strong)', padding: '14px 16px' }}>
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
