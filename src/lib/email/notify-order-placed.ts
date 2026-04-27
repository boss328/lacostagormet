import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/send';
import { renderOrderConfirmation } from '@/lib/email/templates/order-confirmation';
import { renderAdminOrderNotification } from '@/lib/email/templates/admin-order-notification';
import { ADMIN_NOTIFY_EMAIL } from '@/lib/email/from';

/**
 * Fire-and-forget email dispatch after an order finalises in checkout
 * hosted-callback. Sends two emails in parallel:
 *
 *   1. Customer confirmation (to orders.customer_email)
 *   2. Admin/Ops notification (to ADMIN_NOTIFY_EMAIL)
 *
 * Failures of either email are logged but never thrown — the caller
 * (hosted-callback) is in the middle of redirecting the customer to
 * the thank-you page and email failures must not break that path.
 *
 * Also opportunistically marks any matching abandoned_carts row as
 * recovered so reminder emails stop going out for converted carts.
 */
export async function notifyOrderPlaced(orderId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select(
      'id, order_number, status, customer_email, subtotal, shipping_cost, total, shipping_address, created_at',
    )
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr || !order) {
    console.error('[notifyOrderPlaced] order fetch failed', orderErr, { orderId });
    return;
  }

  const row = order as {
    id: string;
    order_number: string;
    status: string;
    customer_email: string;
    subtotal: number | string;
    shipping_cost: number | string;
    total: number | string;
    shipping_address: ShippingAddressJson;
    created_at: string;
  };

  const { data: itemsRows, error: itemsErr } = await admin
    .from('order_items')
    .select('product_sku, product_name, quantity, unit_price, line_subtotal')
    .eq('order_id', orderId)
    .order('product_name');

  if (itemsErr) {
    console.error('[notifyOrderPlaced] items fetch failed', itemsErr, { orderId });
    return;
  }

  const items = (itemsRows ?? []).map((i) => ({
    name: i.product_name as string,
    sku: (i.product_sku as string | null) ?? null,
    quantity: i.quantity as number,
    unitPrice: Number(i.unit_price),
    lineSubtotal: Number(i.line_subtotal),
  }));

  const addr = row.shipping_address ?? ({} as ShippingAddressJson);
  const fullName = [addr.first_name, addr.last_name].filter(Boolean).join(' ') || row.customer_email;
  const firstName = addr.first_name ?? null;

  const orderDate = new Date(row.created_at);
  const isHeld = row.status === 'payment_held';

  const company = (addr.company ?? '').trim() || null;

  // Customer email
  const customerEmail = renderOrderConfirmation({
    orderNumber: row.order_number,
    customerEmail: row.customer_email,
    firstName,
    orderDate,
    items,
    subtotal: Number(row.subtotal),
    shipping: Number(row.shipping_cost),
    total: Number(row.total),
    shippingAddress: {
      company,
      fullName,
      address1: addr.address1 ?? '',
      address2: addr.address2 ?? null,
      city: addr.city ?? '',
      state: addr.state ?? '',
      zip: addr.zip ?? '',
    },
    isHeld,
  });

  // Admin email
  const adminEmail = renderAdminOrderNotification({
    orderId: row.id,
    orderNumber: row.order_number,
    total: Number(row.total),
    customerName: fullName,
    customerEmail: row.customer_email,
    customerPhone: addr.phone ?? null,
    orderDate,
    items: items.map(({ name, sku, quantity }) => ({ name, sku, quantity })),
    shippingAddress: {
      company,
      fullName,
      address1: addr.address1 ?? '',
      address2: addr.address2 ?? null,
      city: addr.city ?? '',
      state: addr.state ?? '',
      zip: addr.zip ?? '',
    },
    isHeld,
  });

  await Promise.all([
    sendTransactionalEmail({
      to: row.customer_email,
      subject: customerEmail.html.match(/<title>(.*?)<\/title>/)?.[1] ?? `Your La Costa Gourmet order #${row.order_number} is confirmed`,
      html: customerEmail.html,
      text: customerEmail.text,
      tags: [
        { name: 'type', value: 'order_confirmation' },
        { name: 'order_number', value: row.order_number },
      ],
    }),
    sendTransactionalEmail({
      to: ADMIN_NOTIFY_EMAIL,
      subject: `🛒 New order #${row.order_number} — $${Number(row.total).toFixed(2)}${isHeld ? ' [HELD]' : ''}`,
      html: adminEmail.html,
      text: adminEmail.text,
      replyTo: row.customer_email,
      tags: [
        { name: 'type', value: 'admin_order' },
        { name: 'order_number', value: row.order_number },
      ],
    }),
    markAbandonedCartsRecovered(row.customer_email, row.id),
  ]);
}

type ShippingAddressJson = {
  first_name?: string;
  last_name?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  country?: string;
};

/**
 * Stop further abandoned-cart reminders for any captured carts that
 * match this customer's email. Best-effort: errors are logged and
 * swallowed so a missing table or a query failure doesn't crash the
 * post-checkout email batch.
 */
async function markAbandonedCartsRecovered(email: string, orderId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from('abandoned_carts')
      .update({ recovered_at: new Date().toISOString(), recovered_order_id: orderId })
      .eq('email', email.toLowerCase())
      .is('recovered_at', null)
      .is('unsubscribed_at', null);
    if (error) {
      // 42P01 = table doesn't exist (migration 0011 not yet run). Silent.
      if (error.code !== '42P01') {
        console.error('[notifyOrderPlaced] mark recovered failed', error);
      }
    }
  } catch (e) {
    console.error('[notifyOrderPlaced] mark recovered threw', e);
  }
}
