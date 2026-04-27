import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';
import { sendTransactionalEmail } from '@/lib/email/send';
import { renderOrderRefunded } from '@/lib/email/templates/order-refunded';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/[orderNumber]/refund
 *
 * Body (JSON):
 *   reason?:        string  — optional, customer-visible
 *   amount_cents?:  number  — optional, defaults to full order total.
 *                             v1 accepts but full-only refunds are the
 *                             intended path; partial-refund UI ships in v2.
 *
 * Level 1 only — the actual money movement happens manually in the
 * Authorize.Net merchant portal. This route only:
 *   1. Verifies the admin session cookie (defence in depth on top of middleware).
 *   2. Confirms the order exists and is eligible (paid / payment_held).
 *   3. UPDATEs orders.status → 'refunded' + refund_at / reason / by /
 *      amount_cents columns (added in migration 0014).
 *   4. Appends an audit line to admin_notes.
 *   5. Fires a customer-facing refund-processing email (fire-and-forget).
 *
 * Eligibility: status must be 'paid' or 'payment_held'. We deliberately
 * allow refunding shipped orders (returns flow) but reject anything
 * already refunded or cancelled.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { orderNumber: string } },
) {
  // ── Auth re-check ──────────────────────────────────────────────────
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

  // ── Parse body ─────────────────────────────────────────────────────
  const body = (await req.json().catch(() => ({}))) as {
    reason?: string;
    amount_cents?: number;
  };
  const reason = (body.reason ?? '').trim().slice(0, 500) || null;
  const requestedCents =
    typeof body.amount_cents === 'number' && Number.isFinite(body.amount_cents)
      ? Math.max(0, Math.floor(body.amount_cents))
      : null;

  // ── Load order ─────────────────────────────────────────────────────
  const admin = createAdminClient();
  const orderNumber = params.orderNumber;

  const { data: order, error: fetchErr } = await admin
    .from('orders')
    .select(
      'id, order_number, status, customer_email, total, shipping_address, admin_notes',
    )
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (fetchErr) {
    console.error('[admin refund] lookup failed', fetchErr);
    return NextResponse.json({ ok: false, errorMessage: 'Lookup failed.' }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ ok: false, errorMessage: 'Order not found.' }, { status: 404 });
  }

  const row = order as {
    id: string;
    order_number: string;
    status: string;
    customer_email: string;
    total: number | string;
    shipping_address: { first_name?: string } | null;
    admin_notes: string | null;
  };

  if (row.status === 'refunded' || row.status === 'partially_refunded') {
    return NextResponse.json(
      { ok: false, errorMessage: 'Order is already refunded.' },
      { status: 400 },
    );
  }
  if (row.status !== 'paid' && row.status !== 'payment_held') {
    return NextResponse.json(
      {
        ok: false,
        errorMessage: `Cannot refund an order in status "${row.status}". Must be paid or payment-held.`,
      },
      { status: 400 },
    );
  }

  // ── Compute amount ─────────────────────────────────────────────────
  const totalDollars = Number(row.total);
  const totalCents = Math.round(totalDollars * 100);
  const amountCents = requestedCents != null ? Math.min(requestedCents, totalCents) : totalCents;
  const amountDollars = amountCents / 100;

  // ── Update order row ───────────────────────────────────────────────
  const now = new Date().toISOString();
  const noteLine = `[${now}] Refund marked · $${amountDollars.toFixed(2)}${reason ? ` · ${reason}` : ''} · finish in Auth.net portal`;
  const notes = row.admin_notes ? `${row.admin_notes}\n${noteLine}` : noteLine;

  const fullUpdate = {
    status: 'refunded',
    refunded_at: now,
    refund_reason: reason,
    refunded_by: 'admin',
    refund_amount_cents: amountCents,
    admin_notes: notes,
  };

  let { error: updErr } = await admin.from('orders').update(fullUpdate).eq('id', row.id);

  // PG 42703 = column not found (migration 0014 not yet applied).
  // Retry with the legacy minimal column set so the action still works
  // ahead of the migration; admin_notes captures the missing fields.
  if (updErr && updErr.code === '42703') {
    const legacy = await admin
      .from('orders')
      .update({ status: 'refunded', admin_notes: notes })
      .eq('id', row.id);
    updErr = legacy.error;
  }

  if (updErr) {
    console.error('[admin refund] update failed', updErr);
    return NextResponse.json(
      { ok: false, errorMessage: updErr.message ?? 'Update failed.' },
      { status: 500 },
    );
  }

  // ── Notify customer (fire-and-forget) ──────────────────────────────
  void sendRefundEmail({
    customerEmail: row.customer_email,
    firstName: row.shipping_address?.first_name ?? null,
    orderNumber: row.order_number,
    refundAmount: amountDollars,
    reason,
  });

  return NextResponse.json({
    ok: true,
    order: {
      id: row.id,
      order_number: row.order_number,
      status: 'refunded',
      refunded_at: now,
      refund_amount_cents: amountCents,
    },
  });
}

async function sendRefundEmail(input: {
  customerEmail: string;
  firstName: string | null;
  orderNumber: string;
  refundAmount: number;
  reason: string | null;
}): Promise<void> {
  const tpl = renderOrderRefunded({
    orderNumber: input.orderNumber,
    customerEmail: input.customerEmail,
    firstName: input.firstName,
    refundAmount: input.refundAmount,
    reason: input.reason,
  });
  await sendTransactionalEmail({
    to: input.customerEmail,
    subject: `Refund processing for La Costa Gourmet order #${input.orderNumber}`,
    html: tpl.html,
    text: tpl.text,
    tags: [
      { name: 'type', value: 'order_refunded' },
      { name: 'order_number', value: input.orderNumber },
    ],
  });
}
