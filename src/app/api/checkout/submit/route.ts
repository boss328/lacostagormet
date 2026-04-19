import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  checkoutSubmitSchema,
  type CheckoutSubmitPayload,
} from '@/lib/checkout/validate';
import {
  computeShipping,
  loadShippingSettings,
  round2,
  centsEqual,
} from '@/lib/checkout/pricing';
import { cartHash } from '@/lib/checkout/cart-hash';
import { chargeCard, type ChargeResult } from '@/lib/authnet/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SubmitResponse =
  | { success: true; orderNumber: string; status: string }
  | { success: false; errorMessage: string };

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  retail_price: number | string;
  wholesale_cost: number | string | null;
  preferred_vendor_id: string | null;
  is_active: boolean;
};

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  total: number | string;
};

const GENERIC_CART_ERROR =
  'One or more items in your cart are no longer available. Please review your cart and try again.';
const GENERIC_SERVER_ERROR =
  'Something went wrong. Your card was not charged. Please try again.';

export async function POST(req: NextRequest) {
  let payload: CheckoutSubmitPayload;
  try {
    const body = await req.json();
    payload = checkoutSubmitSchema.parse(body);
  } catch {
    return json(400, {
      success: false,
      errorMessage: 'Invalid checkout request.',
    });
  }

  const clientIp = extractIp(req);
  const admin = createAdminClient();

  // -------------------------------------------------------------------------
  // 1. Re-validate cart + snapshot prices from DB.
  // -------------------------------------------------------------------------
  const productIds = payload.items.map((i) => i.product_id);
  const { data: products, error: productsErr } = await admin
    .from('products')
    .select('id, sku, name, retail_price, wholesale_cost, preferred_vendor_id, is_active')
    .in('id', productIds);

  if (productsErr) {
    console.error('[checkout] products fetch', productsErr);
    return json(500, { success: false, errorMessage: GENERIC_SERVER_ERROR });
  }

  const productsById = new Map<string, ProductRow>();
  for (const p of (products ?? []) as ProductRow[]) {
    if (p.is_active) productsById.set(p.id, p);
  }

  const missing = payload.items.find((i) => !productsById.has(i.product_id));
  if (missing) {
    return json(400, { success: false, errorMessage: GENERIC_CART_ERROR });
  }

  // -------------------------------------------------------------------------
  // 2. Compute authoritative totals.
  // -------------------------------------------------------------------------
  const lineItems = payload.items.map((i) => {
    const p = productsById.get(i.product_id)!;
    const unitPrice = Number(p.retail_price);
    const lineSubtotal = round2(unitPrice * i.quantity);
    return {
      product_id: i.product_id,
      product_sku: p.sku,
      product_name: p.name,
      quantity: i.quantity,
      unit_price: round2(unitPrice),
      unit_wholesale_cost:
        p.wholesale_cost === null || p.wholesale_cost === undefined
          ? null
          : round2(Number(p.wholesale_cost)),
      line_subtotal: lineSubtotal,
      assigned_vendor_id: p.preferred_vendor_id,
    };
  });

  const subtotal = round2(lineItems.reduce((sum, i) => sum + i.line_subtotal, 0));
  const shippingSettings = await loadShippingSettings();
  const shippingCost = computeShipping(subtotal, payload.shippingAddress.state, shippingSettings);
  const tax = 0;
  const total = round2(subtotal + shippingCost + tax);

  if (!centsEqual(subtotal, payload.clientSubtotal)) {
    // Don't abort — just log. Server total is canonical.
    void admin.from('audit_log').insert({
      entity_type: 'order',
      entity_id: null,
      action: 'price_drift_at_checkout',
      actor_type: 'system',
      ip_address: clientIp,
      metadata: {
        email: payload.email,
        clientSubtotal: payload.clientSubtotal,
        serverSubtotal: subtotal,
        items: payload.items,
      },
    });
  }

  // -------------------------------------------------------------------------
  // 3. Idempotency — look up a recent order with the same cart + IP.
  // -------------------------------------------------------------------------
  const hash = cartHash(
    lineItems.map((l) => ({
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
    })),
  );

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from('orders')
    .select('id, order_number, status, total')
    .eq('cart_hash', hash)
    .eq('client_ip', clientIp)
    .gte('created_at', fiveMinAgo)
    .order('created_at', { ascending: false })
    .limit(1);

  const prior: OrderRow | null = (recent?.[0] as OrderRow | undefined) ?? null;

  // If the prior order already settled (paid / held / cancelled), reuse it
  // without re-calling Auth.net. If the prior order is still pending, a
  // prior submit is in flight — treat as idempotent and return that order.
  if (prior) {
    if (prior.status === 'paid') {
      return json(200, { success: true, orderNumber: prior.order_number, status: 'paid' });
    }
    if (prior.status === 'payment_held') {
      return json(200, {
        success: true,
        orderNumber: prior.order_number,
        status: 'payment_held',
      });
    }
    if (prior.status === 'pending') {
      // Prior call may still be mid-charge. Don't duplicate the Auth.net call.
      return json(200, {
        success: true,
        orderNumber: prior.order_number,
        status: 'pending',
      });
    }
    // status === 'cancelled' (declined) → fall through and create a fresh
    // order. Customer is retrying. Note: we don't re-use the order_number
    // because Auth.net's refId semantics don't play well with retries on
    // a previously-failed transaction.
  }

  // -------------------------------------------------------------------------
  // 4. Create orders row + order_items rows.
  // -------------------------------------------------------------------------
  const shipAddr = payload.shippingAddress;
  const addressJson = {
    first_name: shipAddr.firstName,
    last_name: shipAddr.lastName,
    address1: shipAddr.address1,
    address2: shipAddr.address2 ?? '',
    city: shipAddr.city,
    state: shipAddr.state,
    zip: shipAddr.zip,
    country: 'US',
    phone: shipAddr.phone,
  };

  const { data: createdOrder, error: orderErr } = await admin
    .from('orders')
    .insert({
      customer_email: payload.email,
      status: 'pending',
      subtotal,
      shipping_cost: shippingCost,
      tax,
      total,
      shipping_address: addressJson,
      billing_address: addressJson,
      cart_hash: hash,
      client_ip: clientIp,
    })
    .select('id, order_number, status, total')
    .single();

  if (orderErr || !createdOrder) {
    console.error('[checkout] order insert', orderErr);
    return json(500, { success: false, errorMessage: GENERIC_SERVER_ERROR });
  }

  const order = createdOrder as OrderRow;

  const { error: itemsErr } = await admin.from('order_items').insert(
    lineItems.map((l) => ({
      order_id: order.id,
      product_id: l.product_id,
      product_sku: l.product_sku,
      product_name: l.product_name,
      quantity: l.quantity,
      unit_price: l.unit_price,
      unit_wholesale_cost: l.unit_wholesale_cost,
      line_subtotal: l.line_subtotal,
      assigned_vendor_id: l.assigned_vendor_id,
    })),
  );

  if (itemsErr) {
    console.error('[checkout] order_items insert', itemsErr);
    // Clean up the orphaned order row so the cart-hash lookup doesn't
    // re-use it on retry.
    await admin.from('orders').delete().eq('id', order.id);
    return json(500, { success: false, errorMessage: GENERIC_SERVER_ERROR });
  }

  // -------------------------------------------------------------------------
  // 5. Charge the card via Auth.net.
  // -------------------------------------------------------------------------
  const charge = await chargeCard({
    opaqueData: payload.opaqueData,
    amount: total,
    orderNumber: order.order_number,
    customerEmail: payload.email,
    billingAddress: shipAddr,
    shippingAddress: shipAddr,
  });

  await persistPayment(admin, order.id, total, charge);
  await updateOrderStatus(admin, order.id, charge);

  if (charge.outcome === 'approved' || charge.outcome === 'held_for_review') {
    return json(200, {
      success: true,
      orderNumber: order.order_number,
      status: charge.outcome === 'approved' ? 'paid' : 'payment_held',
    });
  }

  // Declined / network error — tell the client, include the customer message.
  return json(200, {
    success: false,
    errorMessage: charge.customerMessage,
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function json(status: number, body: SubmitResponse): NextResponse {
  return NextResponse.json(body, { status });
}

function extractIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return req.ip ?? 'unknown';
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function persistPayment(
  admin: AdminClient,
  orderId: string,
  amount: number,
  charge: ChargeResult,
): Promise<void> {
  const paymentStatus =
    charge.outcome === 'approved'
      ? 'succeeded'
      : charge.outcome === 'held_for_review'
        ? 'held_for_review'
        : 'failed';

  const { error } = await admin.from('payments').insert({
    order_id: orderId,
    type: 'auth_capture',
    amount,
    status: paymentStatus,
    authnet_transaction_id: charge.transactionId,
    authnet_response_code: charge.responseCode,
    authnet_response_reason: charge.responseReason,
    authnet_avs_result: charge.avsResult,
    authnet_cvv_result: charge.cvvResult,
    fraud_held: charge.outcome === 'held_for_review',
    fraud_reason: charge.fraudReason,
    card_last_four: charge.cardLastFour,
    card_brand: charge.cardBrand,
    raw_response: safeJson(charge.rawResponse),
  });

  if (error) {
    console.error('[checkout] payments insert', error);
  }
}

async function updateOrderStatus(
  admin: AdminClient,
  orderId: string,
  charge: ChargeResult,
): Promise<void> {
  const nextStatus =
    charge.outcome === 'approved'
      ? 'paid'
      : charge.outcome === 'held_for_review'
        ? 'payment_held'
        : 'cancelled';

  const { error } = await admin
    .from('orders')
    .update({ status: nextStatus })
    .eq('id', orderId);

  if (error) {
    console.error('[checkout] order status update', error);
  }
}

function safeJson(v: unknown): unknown {
  try {
    JSON.stringify(v);
    return v;
  } catch {
    return { note: 'raw response not JSON-serialisable' };
  }
}
