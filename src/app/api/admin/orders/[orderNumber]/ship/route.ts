import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/send';
import { renderOrderShipped } from '@/lib/email/templates/order-shipped';
import { detectCarrier } from '@/lib/email/carrier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/[orderNumber]/ship
 * Body: { tracking_number: string }
 *
 * Admin gate: middleware already verified the lcg_admin cookie. Any request
 * hitting this handler has passed that check.
 *
 * Side-effects on success:
 *   - orders.fulfillment_status → 'shipped'
 *   - orders.tracking_number    → <tracking>   (column added in migration 0011)
 *   - orders.shipped_at         → NOW()        (column added in migration 0011)
 *   - orders.admin_notes        → appended audit line (legacy log behaviour)
 *   - Customer notified via Resend (fire-and-forget; never blocks response)
 *
 * The tracking_number / shipped_at column writes are wrapped to no-op
 * gracefully if the migration hasn't been applied yet — the legacy
 * admin_notes line still captures the data so nothing is lost.
 */
export async function POST(req: NextRequest, { params }: { params: { orderNumber: string } }) {
  const body = (await req.json().catch(() => ({}))) as { tracking_number?: string };
  const tracking = (body.tracking_number ?? '').trim();
  if (!tracking) {
    return NextResponse.json({ errorMessage: 'tracking_number required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const orderNumber = params.orderNumber;

  const { data: order, error: fetchErr } = await admin
    .from('orders')
    .select('id, status, fulfillment_status, admin_notes, customer_email, shipping_address')
    .eq('order_number', orderNumber)
    .maybeSingle();
  if (fetchErr || !order) {
    return NextResponse.json({ errorMessage: 'order not found' }, { status: 404 });
  }
  const row = order as {
    id: string;
    status: string;
    fulfillment_status: string;
    admin_notes: string | null;
    customer_email: string;
    shipping_address: { first_name?: string } | null;
  };

  if (row.status !== 'paid') {
    return NextResponse.json(
      { errorMessage: 'order must be in paid status to ship' },
      { status: 400 },
    );
  }

  const noteLine = `[${new Date().toISOString()}] Shipped · tracking ${tracking}`;
  const notes = row.admin_notes ? `${row.admin_notes}\n${noteLine}` : noteLine;

  // Try to write the new columns first; on PG-relation-error 42703 (column
  // doesn't exist yet because 0011 hasn't been applied), retry with the
  // legacy column set.
  const fullUpdate = {
    fulfillment_status: 'shipped',
    admin_notes: notes,
    tracking_number: tracking,
    shipped_at: new Date().toISOString(),
  };
  let { error: updateErr } = await admin.from('orders').update(fullUpdate).eq('id', row.id);

  if (updateErr && updateErr.code === '42703') {
    const legacyResult = await admin
      .from('orders')
      .update({ fulfillment_status: 'shipped', admin_notes: notes })
      .eq('id', row.id);
    updateErr = legacyResult.error;
  }

  if (updateErr) {
    console.error('[admin ship] update failed', updateErr);
    return NextResponse.json({ errorMessage: 'update failed' }, { status: 500 });
  }

  // Fire-and-forget customer notification.
  void sendShippedEmail({
    customerEmail: row.customer_email,
    firstName: row.shipping_address?.first_name ?? null,
    orderNumber,
    tracking,
  });

  return NextResponse.json({ success: true });
}

async function sendShippedEmail(input: {
  customerEmail: string;
  firstName: string | null;
  orderNumber: string;
  tracking: string;
}): Promise<void> {
  const detected = detectCarrier(input.tracking);
  const tpl = renderOrderShipped({
    orderNumber: input.orderNumber,
    customerEmail: input.customerEmail,
    firstName: input.firstName,
    trackingNumber: input.tracking,
    carrier: detected?.carrier ?? null,
    trackingUrl: detected?.trackingUrl ?? null,
  });
  await sendTransactionalEmail({
    to: input.customerEmail,
    subject: `Your La Costa Gourmet order #${input.orderNumber} has shipped`,
    html: tpl.html,
    text: tpl.text,
    tags: [
      { name: 'type', value: 'order_shipped' },
      { name: 'order_number', value: input.orderNumber },
    ],
  });
}
