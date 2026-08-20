import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyPendingOrderPayment } from '@/lib/checkout/verify-pending-payment';
import type { FinalizableOrder } from '@/lib/checkout/finalize-payment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Payment-status poll for the order page's pending state. Each poll is an
 * ACTIVE check: while the order is pending we re-run server-side
 * verification against Auth.net (unsettled-list scan → authoritative
 * details → idempotent finalize), so confirmation doesn't depend on the
 * webhook being registered or timely. Whichever of poll and webhook wins
 * the claim, the other sees already_final.
 *
 * Exposes only the order's status string for a known order number — the
 * same anonymous-by-order-number access model as /order/[orderNumber].
 */

const ORDER_NUMBER_RE = /^[A-Z]{2,8}-\d{3,10}$/;

type StatusBody = { status: string };

function json(status: number, body: StatusBody): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  let orderNumber: unknown;
  try {
    ({ orderNumber } = (await req.json()) as { orderNumber?: unknown });
  } catch {
    return json(400, { status: 'bad_request' });
  }
  if (typeof orderNumber !== 'string' || !ORDER_NUMBER_RE.test(orderNumber)) {
    return json(400, { status: 'bad_request' });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('orders')
    .select('id, order_number, status, total')
    .eq('order_number', orderNumber)
    .maybeSingle();
  const order = (data as FinalizableOrder | null) ?? null;

  if (!order) return json(404, { status: 'not_found' });
  if (order.status !== 'pending') return json(200, { status: order.status });

  const verify = await verifyPendingOrderPayment({
    admin,
    order,
    source: 'status_poll',
    // A poll loop over an abandoned order shouldn't write a no-transaction
    // audit row every few seconds.
    auditNoTransaction: false,
  });

  switch (verify.outcome) {
    case 'finalized':
      return json(200, { status: verify.orderStatus });
    case 'already_final': {
      // Someone else (webhook, callback) claimed it between our select and
      // now — report the fresh status.
      const { data: fresh } = await admin
        .from('orders')
        .select('status')
        .eq('id', order.id)
        .maybeSingle();
      return json(200, { status: (fresh as { status: string } | null)?.status ?? 'pending' });
    }
    case 'declined':
      return json(200, { status: 'cancelled' });
    // Mismatches are audited inside finalize; the poller just keeps
    // waiting — an admin or the webhook resolves them.
    case 'refid_mismatch':
    case 'amount_mismatch':
    case 'no_transaction':
    case 'lookup_failed':
      return json(200, { status: 'pending' });
  }
}
