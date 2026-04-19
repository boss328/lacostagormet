import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type OrderRow = {
  order_number: string;
  status: string;
  fulfillment_status: string;
  total: number | string;
  customer_email: string;
  created_at: string;
};

function fmtMoney(v: number | string): string {
  const n = typeof v === 'string' ? Number(v) : v;
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

async function fetchDashboard() {
  const admin = createAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [recentOrders, todayPaid, unfulfilled, customerCount, orderCount, totalRevenue] =
    await Promise.all([
      admin
        .from('orders')
        .select('order_number, status, fulfillment_status, total, customer_email, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
      admin
        .from('orders')
        .select('total')
        .eq('status', 'paid')
        .gte('created_at', since24h),
      admin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'paid')
        .not('fulfillment_status', 'in', '(shipped,delivered)'),
      admin.from('customers').select('id', { count: 'exact', head: true }),
      admin.from('orders').select('id', { count: 'exact', head: true }),
      admin
        .from('orders')
        .select('total')
        .in('status', ['paid', 'payment_held']),
    ]);

  const todaysRevenue =
    (todayPaid.data ?? []).reduce(
      (sum, o: { total: number | string }) => sum + Number(o.total ?? 0),
      0,
    ) || 0;
  const lifetimeRevenue =
    (totalRevenue.data ?? []).reduce(
      (sum, o: { total: number | string }) => sum + Number(o.total ?? 0),
      0,
    ) || 0;

  return {
    recent: (recentOrders.data ?? []) as OrderRow[],
    todaysRevenue,
    unfulfilledCount: unfulfilled.count ?? 0,
    customerCount: customerCount.count ?? 0,
    orderCount: orderCount.count ?? 0,
    lifetimeRevenue,
  };
}

export default async function AdminDashboardPage() {
  const d = await fetchDashboard();

  return (
    <>
      <header className="mb-10">
        <p className="type-label text-accent mb-4">§ Dashboard</p>
        <h1 className="type-display-2">Morning view.</h1>
      </header>

      <section className="grid gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1 lg:grid-cols-4 mb-12">
        <StatCard label="Today's revenue" value={fmtMoney(d.todaysRevenue)} hint="Last 24 hours" />
        <StatCard
          label="Pending fulfillment"
          value={String(d.unfulfilledCount)}
          hint="Paid, not shipped"
          href="/admin/orders?status=paid&fulfillment=unfulfilled"
        />
        <StatCard
          label="Total orders"
          value={d.orderCount.toLocaleString()}
          hint="Lifetime"
          href="/admin/orders"
        />
        <StatCard
          label="Customers"
          value={d.customerCount.toLocaleString()}
          hint="On file"
          href="/admin/customers"
        />
      </section>

      <section>
        <div
          className="flex items-baseline justify-between pb-3 mb-3"
          style={{ borderBottom: '1px solid var(--rule-strong)' }}
        >
          <span className="type-label text-ink">§&nbsp;&nbsp;Recent orders</span>
          <Link
            href="/admin/orders"
            className="type-label text-ink hover:text-brand-deep transition-colors duration-200"
          >
            View all&nbsp;→
          </Link>
        </div>

        {d.recent.length === 0 ? (
          <p className="type-data-mono text-ink-muted py-6">No orders yet.</p>
        ) : (
          <div>
            {d.recent.map((o) => (
              <Link
                key={o.order_number}
                href={`/admin/orders/${o.order_number}`}
                className="grid items-center gap-4 py-3 px-2 hover:bg-paper-2 transition-colors duration-200"
                style={{
                  gridTemplateColumns: 'minmax(120px,auto) 1fr auto auto auto',
                  borderBottom: '1px solid var(--rule)',
                  minHeight: 48,
                }}
              >
                <span
                  className="font-display italic text-brand-deep"
                  style={{ fontSize: '17px', fontWeight: 500, letterSpacing: '-0.015em' }}
                >
                  {o.order_number}
                </span>
                <span className="font-display text-ink truncate">{o.customer_email}</span>
                <span className="type-data-mono text-ink-muted">{fmtDate(o.created_at)}</span>
                <StatusPill status={o.status} />
                <span className="font-display text-ink text-right" style={{ fontSize: '15px' }}>
                  {fmtMoney(o.total)}
                </span>
              </Link>
            ))}
          </div>
        )}

        <p className="type-data-mono text-ink-muted mt-6">
          Lifetime revenue on file: {fmtMoney(d.lifetimeRevenue)}
        </p>
      </section>
    </>
  );
}

function StatCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <div
      className="bg-cream h-full"
      style={{ border: '1px solid var(--rule-strong)', padding: '20px 22px' }}
    >
      <p className="type-label-sm text-ink-muted mb-3">{label}</p>
      <p
        className="font-display italic text-brand-deep"
        style={{ fontSize: '32px', lineHeight: 1, letterSpacing: '-0.022em', fontWeight: 500 }}
      >
        {value}
      </p>
      {hint && <p className="type-data-mono text-ink-muted mt-3">{hint}</p>}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="hover:opacity-90 transition-opacity duration-200">
        {inner}
      </Link>
    );
  }
  return inner;
}

function StatusPill({ status }: { status: string }) {
  const bg =
    status === 'paid'
      ? 'var(--color-forest)'
      : status === 'payment_held'
        ? 'var(--color-gold)'
        : status === 'cancelled'
          ? 'var(--color-accent)'
          : 'var(--color-ink-muted)';
  return (
    <span
      className="type-label-sm text-cream"
      style={{ padding: '4px 8px', background: bg }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
