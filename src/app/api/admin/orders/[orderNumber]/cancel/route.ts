import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';
import { sendGa4RefundEvent } from '@/lib/analytics/ga-measurement-protocol';
import { isReadOnlyPreview } from '@/lib/preview-mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/[orderNumber]/cancel
 *
 * Body (JSON):
 *   reason?: string  — optional, recorded in admin_notes
 *
 * Cancels an order that never completed payment. Eligible statuses:
 *   - 'pending'       — customer never returned from Auth.net hosted form
 *   - 'payment_held'  — held for review, never confirmed
 *
 * NOT eligible: 'paid' (use the refund flow instead so the customer
 * gets notified and the audit trail records the money movement) or
 * anything terminal ('cancelled', 'refunded', 'partially_refunded').
 *
 * No customer email is sent — these orders never charged money, so
 * there's nothing to refund and no expectation to reset.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { orderNumber: string } },
) {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const expected = await expectedSessionToken();
  if (!expected) {
    return NextResponse.json(
      { ok: false, errorMessage: 'Server misconfigured.' },
      { status: 503 },
    );
  }
  if (cookie !== expected) {
    return NextResponse.json({ ok: false, errorMessage: 'Not authenticated.' }, { status: 401 });
  }
  if (req.headers.get('origin') !== req.nextUrl.origin) {
    return NextResponse.json({ ok: false, errorMessage: 'Invalid request origin.' }, { status: 403 });
  }
  if (isReadOnlyPreview()) {
    return NextResponse.json({ ok: false, errorMessage: 'Order changes are disabled in preview.' }, { status: 409 });
  }

  const body = ((await req.json().catch(() => null)) ?? {}) as { reason?: string; paymentClosed?: boolean };
  const reason = (typeof body.reason === 'string' ? body.reason : '').trim().slice(0, 500) || null;

  const admin = createAdminClient();
  const orderNumber = params.orderNumber;

  const { data: order, error: fetchErr } = await admin
    .from('orders')
    .select('id, order_number, status, source, total, admin_notes')
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (fetchErr) {
    console.error('[admin cancel] lookup failed', fetchErr);
    return NextResponse.json({ ok: false, errorMessage: 'Lookup failed.' }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ ok: false, errorMessage: 'Order not found.' }, { status: 404 });
  }

  const row = order as {
    id: string;
    order_number: string;
    status: string;
    source: string | null;
    total: number | string;
    admin_notes: string | null;
  };

  if (row.status !== 'pending' && row.status !== 'payment_held') {
    return NextResponse.json(
      {
        ok: false,
        errorMessage:
          row.status === 'paid'
            ? 'Order is paid. Use the refund flow instead.'
            : `Cannot cancel an order in status "${row.status}".`,
      },
      { status: 400 },
    );
  }
  if (row.source !== 'manual' && body.paymentClosed !== true) {
    return NextResponse.json({ ok: false, errorMessage: 'First confirm in the payment provider that payment is voided or closed and cannot complete. Then cancel this order to release pending stock.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const noteLine = `[${now}] Cancelled by admin${body.paymentClosed ? ' · Admin confirmed provider payment is closed' : ''}${reason ? ` · ${reason}` : ''}`;
  const notes = row.admin_notes ? `${row.admin_notes}\n${noteLine}` : noteLine;

  const { data: cancelled, error: updErr } = await admin
    .from('orders')
    .update({ status: 'cancelled', admin_notes: notes })
    .eq('id', row.id)
    .eq('status', row.status)
    .select('id');

  if (updErr) {
    console.error('[admin cancel] update failed', updErr);
    return NextResponse.json(
      { ok: false, errorMessage: updErr.message ?? 'Update failed.' },
      { status: 500 },
    );
  }
  if (!cancelled?.length) {
    return NextResponse.json({ ok: false, errorMessage: 'This order changed while you were cancelling it. Refresh and check its payment status.' }, { status: 409 });
  }

  // A storefront 'payment_held' order fired a purchase conversion when it was
  // placed, so voiding it nets that revenue back out (full total). 'pending'
  // orders never fired one, and admin manual orders (source='manual') never
  // load the confirmation page — neither should emit a refund. Awaited so it
  // sends reliably before the function returns; never throws.
  if (row.status === 'payment_held' && row.source !== 'manual') {
    await sendGa4RefundEvent({
      orderNumber: row.order_number,
      value: Number(row.total),
      currency: 'USD',
    });
  }

  return NextResponse.json({
    ok: true,
    order: { id: row.id, order_number: row.order_number, status: 'cancelled' },
  });
}
