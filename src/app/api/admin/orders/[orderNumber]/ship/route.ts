import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { shippingWriteError } from '@/lib/admin/shipping-access';
import { sendTransactionalEmail } from '@/lib/email/send';
import { renderOrderShipped } from '@/lib/email/templates/order-shipped';
import { detectCarrier } from '@/lib/email/carrier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Existing whole-order control is only valid when there are no split shipments. */
export async function POST(req: NextRequest, { params }: { params: { orderNumber: string } }) {
  const denied = await shippingWriteError(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const tracking = typeof body.tracking_number === 'string' ? body.tracking_number.trim() : '';
  if (!/^[a-zA-Z0-9 -]{3,100}$/.test(tracking)) {
    return NextResponse.json({ errorMessage: 'Enter a valid tracking number.' }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: order } = await admin.from('orders')
    .select('id, customer_email, shipping_address')
    .eq('order_number', params.orderNumber).maybeSingle();
  if (!order) return NextResponse.json({ errorMessage: 'Order not found.' }, { status: 404 });
  const { data: changed, error } = await admin.rpc('shipping_mark_order_manual', {
    p_order_id: order.id, p_tracking: tracking,
  });
  if (error) return NextResponse.json({ errorMessage: error.code === 'P0001' ? error.message : 'Could not update shipping status.' }, { status: 400 });
  if (!changed) return NextResponse.json({ success: true });
  const detected = detectCarrier(tracking);
  const template = renderOrderShipped({
    orderNumber: params.orderNumber, customerEmail: order.customer_email,
    firstName: order.shipping_address?.first_name ?? null, trackingNumber: tracking,
    carrier: detected?.carrier ?? null, trackingUrl: detected?.trackingUrl ?? null,
  });
  const sent = await sendTransactionalEmail({
    to: order.customer_email, subject: `Your La Costa Gourmet order #${params.orderNumber} has shipped`,
    html: template.html, text: template.text, idempotencyKey: `whole-order-shipped/${order.id}`,
    tags: [{ name: 'type', value: 'order_shipped' }],
  });
  return NextResponse.json({ success: true, warning: sent.ok ? undefined : 'Order marked shipped; customer email could not be sent.' });
}
