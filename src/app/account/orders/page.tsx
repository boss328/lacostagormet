import Link from 'next/link';
import { getSessionUser } from '@/lib/supabase/auth-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { OrderRowCompact } from '@/components/account/OrderRowCompact';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export default async function AccountOrdersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await getSessionUser();
  const email = user?.email ?? '';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();
  const { data: orders, count } = await admin
    .from('orders')
    .select(
      'order_number, created_at, status, fulfillment_status, tracking_number, total, order_items(product_name, quantity)',
      { count: 'exact' },
    )
    .eq('customer_email', email)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = (orders ?? []) as Array<{
    order_number: string;
    created_at: string;
    status: string;
    fulfillment_status: string | null;
    tracking_number: string | null;
    total: number | string;
    order_items?: Array<{ product_name: string; quantity: number }>;
  }>;

  return (
    <>
      <header className="mb-10">
        <p className="type-label text-accent mb-5">§ The ledger</p>
        <h1 className="type-display-2">
          Your <em className="type-accent">orders</em>.
        </h1>
        <p className="type-data-mono text-ink-muted mt-4">
          {total} {total === 1 ? 'order' : 'orders'} on file
        </p>
      </header>

      {rows.length === 0 ? (
        <div
          className="bg-paper-2 text-center px-10 py-16 max-sm:px-5"
          style={{ border: '1px solid var(--rule)' }}
        >
          <p
            className="font-display italic text-brand-deep mb-5"
            style={{ fontSize: '22px', letterSpacing: '-0.02em' }}
          >
            Nothing here yet.
          </p>
          <Link
            href="/shop"
            className="type-label text-ink hover:text-brand-deep transition-colors duration-200"
          >
            Shop the catalog&nbsp;→
          </Link>
        </div>
      ) : (
        <>
          {rows.map((order) => (
            <OrderRowCompact key={order.order_number} order={order} />
          ))}
          {pageCount > 1 && (
            <div className="flex items-center justify-between pt-8 max-sm:pt-6">
              {page > 1 ? (
                <Link
                  href={`/account/orders?page=${page - 1}`}
                  className="type-label text-ink hover:text-brand-deep transition-colors duration-200"
                >
                  ←&nbsp;Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="type-data-mono text-ink-muted">
                Page {page} of {pageCount}
              </span>
              {page < pageCount ? (
                <Link
                  href={`/account/orders?page=${page + 1}`}
                  className="type-label text-ink hover:text-brand-deep transition-colors duration-200"
                >
                  Older&nbsp;→
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
