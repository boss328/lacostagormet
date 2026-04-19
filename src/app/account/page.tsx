import Link from 'next/link';
import { getSessionUser } from '@/lib/supabase/auth-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { OrderRowCompact } from '@/components/account/OrderRowCompact';

export const dynamic = 'force-dynamic';

type RecentOrder = {
  order_number: string;
  created_at: string;
  status: string;
  total: number | string;
  order_items: Array<{ product_name: string; quantity: number }>;
};

async function fetchAccountData(email: string) {
  const admin = createAdminClient();
  const { data: customerRow } = await admin
    .from('customers')
    .select('first_name, last_name')
    .eq('email', email)
    .maybeSingle();

  const { data: orders } = await admin
    .from('orders')
    .select('order_number, created_at, status, total, order_items(product_name, quantity)')
    .eq('customer_email', email)
    .order('created_at', { ascending: false })
    .limit(3);

  return {
    customer: customerRow as { first_name: string | null; last_name: string | null } | null,
    orders: (orders ?? []) as unknown as RecentOrder[],
  };
}

export default async function AccountOverviewPage() {
  const user = await getSessionUser();
  const email = user?.email ?? '';
  const { customer, orders } = await fetchAccountData(email);

  const firstName = customer?.first_name?.trim() || null;

  return (
    <>
      <header className="mb-12">
        <p className="type-label text-accent mb-5">§ Overview</p>
        <h1 className="type-display-2">
          Welcome back{firstName ? ', ' : ''}
          {firstName && <em className="type-accent">{firstName}</em>}.
        </h1>
        <p className="type-data-mono text-ink-muted mt-4">
          Signed in as {email}
        </p>
      </header>

      <section className="mb-14">
        <div
          className="flex items-baseline justify-between pb-4 mb-2"
          style={{ borderBottom: '1px solid var(--rule-strong)' }}
        >
          <span className="type-label text-ink">§&nbsp;&nbsp;Recent orders</span>
          <Link
            href="/account/orders"
            className="type-label text-ink hover:text-brand-deep transition-colors duration-200"
          >
            View all&nbsp;→
          </Link>
        </div>
        {orders.length === 0 ? (
          <div
            className="bg-paper-2 text-center px-10 py-16 max-sm:px-5"
            style={{ border: '1px solid var(--rule)' }}
          >
            <p
              className="font-display italic text-brand-deep mb-5"
              style={{ fontSize: '22px', letterSpacing: '-0.02em' }}
            >
              No orders on file yet.
            </p>
            <Link
              href="/shop"
              className="type-label text-ink hover:text-brand-deep transition-colors duration-200"
            >
              Shop the catalog&nbsp;→
            </Link>
          </div>
        ) : (
          orders.map((order) => <OrderRowCompact key={order.order_number} order={order} />)
        )}
      </section>
    </>
  );
}
