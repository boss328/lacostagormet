import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';

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

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = (body.reason ?? '').trim().slice(0, 500) || null;

  const admin = createAdminClient();
  const orderNumber = params.orderNumber;

  const { data: order, error: fetchErr } = await admin
    .from('orders')
    .select('id, order_number, status, admin_notes')
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

  const now = new Date().toISOString();
  const noteLine = `[${now}] Cancelled by admin${reason ? ` · ${reason}` : ''}`;
  const notes = row.admin_notes ? `${row.admin_notes}\n${noteLine}` : noteLine;

  const { error: updErr } = await admin
    .from('orders')
    .update({ status: 'cancelled', admin_notes: notes })
    .eq('id', row.id);

  if (updErr) {
    console.error('[admin cancel] update failed', updErr);
    return NextResponse.json(
      { ok: false, errorMessage: updErr.message ?? 'Update failed.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    order: { id: row.id, order_number: row.order_number, status: 'cancelled' },
  });
}
