import { readAllRows } from '@/lib/admin/read-all-rows';
import { searchFilter } from '@/lib/admin/search-filter';
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { toCsv, csvFilename } from '@/lib/admin/csv';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/orders/export?view=<filter>&q=<search>
 *
 * Exports the filtered list in stable batches, including rows beyond the
 * Data API response limit. Uses the same views and literal search as the list.
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const expected = await expectedSessionToken();
  if (!expected || cookie !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl;
  const view = url.searchParams.get('view') ?? 'all';
  const search = url.searchParams.get('q') ?? '';

  const admin = createAdminClient();
  const buildQuery = () => {
    let q = admin
      .from('orders')
      .select(
        'order_number, status, fulfillment_status, customer_email, subtotal, shipping_cost, tax, total, created_at, shipping_address',
      );

    switch (view) {
      case 'paid':
        q = q.eq('status', 'paid');
        break;
      case 'pending-fulfillment':
        q = q.eq('status', 'paid').not('fulfillment_status', 'in', '(shipped,delivered)');
        break;
      case 'payment_held':
        q = q.eq('status', 'payment_held');
        break;
      case 'cancelled':
        q = q.eq('status', 'cancelled');
        break;
      case 'high-value':
        q = q.gte('total', 500);
        break;
      case 'this-week': {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        q = q.gte('created_at', since);
        break;
      }
    }

    if (search) {
      q = q.or(searchFilter(['order_number', 'customer_email'], search));
    }

    q = q.order('created_at', { ascending: false }).order('id');

    return q;
  };
  const { data, error } = await readAllRows((from, to) => buildQuery().range(from, to));
  if (error) {
    console.error('[admin/orders/export]', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  type OrderRow = {
    order_number: string;
    status: string;
    fulfillment_status: string;
    customer_email: string;
    subtotal: number | string;
    shipping_cost: number | string;
    tax: number | string;
    total: number | string;
    created_at: string;
    shipping_address: { state?: string; city?: string; zip?: string } | null;
  };

  const rows = ((data ?? []) as OrderRow[]).map((o) => ({
    order_number: o.order_number,
    status: o.status,
    fulfillment_status: o.fulfillment_status,
    customer_email: o.customer_email,
    subtotal: Number(o.subtotal).toFixed(2),
    shipping_cost: Number(o.shipping_cost).toFixed(2),
    tax: Number(o.tax).toFixed(2),
    total: Number(o.total).toFixed(2),
    created_at: o.created_at,
    ship_city: o.shipping_address?.city ?? '',
    ship_state: o.shipping_address?.state ?? '',
    ship_zip: o.shipping_address?.zip ?? '',
  }));

  const columns = [
    'order_number', 'status', 'fulfillment_status', 'customer_email',
    'subtotal', 'shipping_cost', 'tax', 'total',
    'created_at', 'ship_city', 'ship_state', 'ship_zip',
  ];
  const body = toCsv(rows, columns);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${csvFilename(`orders-${view}`)}"`,
      'cache-control': 'no-store',
    },
  });
}
