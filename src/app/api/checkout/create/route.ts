import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  checkoutCreateSchema,
  type CheckoutCreatePayload,
} from '@/lib/checkout/validate';
import {
  computeShipping,
  loadShippingSettings,
  round2,
  centsEqual,
} from '@/lib/checkout/pricing';
import { cartHash } from '@/lib/checkout/cart-hash';
import { getHostedPaymentToken } from '@/lib/authnet/hosted';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SuccessResponse = {
  success: true;
  orderNumber: string;
  formToken: string;
  hostedUrl: string;
};
type FailureResponse = {
  success: false;
  errorMessage: string;
};
type CreateResponse = SuccessResponse | FailureResponse;

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
  'Something went wrong. Please try again.';

/**
 * POST /api/checkout/create
 *
 * Accept Hosted flow entry point. Creates a pending order row + requests a
 * form token from Auth.net. Client uses the token to POST the browser to
 * Auth.net's hosted payment page. Finalisation happens in
 * /api/checkout/hosted-callback after the customer completes payment.
 *
 * Order lifecycle here:
 *   - Validate payload
 *   - Re-fetch product prices (server is canonical)
 *   - Compute totals (cart_hash, shipping, tax=0, total)
 *   - Idempotency: find existing pending order with same hash + IP
 *   - Create orders + order_items
 *   - Call Auth.net getHostedPaymentPageRequest
 *   - Return formToken + hostedUrl
 *
 * If Auth.net token fetch fails AFTER the order row is written, the order
 * stays 'pending' with no Auth.net trace. The idempotency window means the
 * user can retry within 5 min without creating a duplicate.
 */
export async function POST(req: NextRequest) {
  try {
    let payload: CheckoutCreatePayload;
    try {
      const body = await req.json();
      payload = checkoutCreateSchema.parse(body);
    } catch (parseErr) {
      console.error('[checkout/create] validation failed', parseErr);
      return json(400, { success: false, errorMessage: 'Invalid checkout request.' });
    }

    const clientIp = extractIp(req);
    const admin = createAdminClient();

    // 1. Re-validate cart + snapshot prices.
    const productIds = payload.items.map((i) => i.product_id);
    const { data: products, error: productsErr } = await admin
      .from('products')
      .select('id, sku, name, retail_price, wholesale_cost, preferred_vendor_id, is_active')
      .in('id', productIds);

    if (productsErr) {
      console.error('[checkout/create] products fetch', productsErr);
      return json(500, { success: false, errorMessage: GENERIC_SERVER_ERROR });
    }

    const productsById = new Map<string, ProductRow>();
    for (const p of (products ?? []) as ProductRow[]) {
      if (p.is_active) productsById.set(p.id, p);
    }
    if (payload.items.find((i) => !productsById.has(i.product_id))) {
      return json(400, { success: false, errorMessage: GENERIC_CART_ERROR });
    }

    // 2. Authoritative totals.
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
    const shippingCost = computeShipping(
      subtotal,
      payload.shippingAddress.state,
      shippingSettings,
    );
    const tax = 0;
    const total = round2(subtotal + shippingCost + tax);

    if (!centsEqual(subtotal, payload.clientSubtotal)) {
      void admin.from('audit_log').insert({
        entity_type: 'order',
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

    // 3. Idempotency — find a recent pending order with the same cart + IP.
    const hash = cartHash(
      lineItems.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
      })),
    );
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recent, error: recentErr } = await admin
      .from('orders')
      .select('id, order_number, status, total')
      .eq('cart_hash', hash)
      .eq('client_ip', clientIp)
      .gte('created_at', fiveMinAgo)
      .order('created_at', { ascending: false })
      .limit(1);

    if (recentErr) {
      console.error('[checkout/create] idempotency lookup', recentErr);
      return json(500, { success: false, errorMessage: GENERIC_SERVER_ERROR });
    }

    const prior: OrderRow | null = (recent?.[0] as OrderRow | undefined) ?? null;
    let order: OrderRow;

    if (prior && (prior.status === 'paid' || prior.status === 'payment_held')) {
      // Completed order — tell the client to go straight to confirmation.
      // There is no form token to fetch; the caller should redirect.
      return json(200, {
        success: false,
        errorMessage: `Order ${prior.order_number} is already ${prior.status}. Redirecting…`,
      });
    }

    if (prior && prior.status === 'pending') {
      // Re-use the same order row; fetch a fresh token against the same
      // order_number (Auth.net tokens are short-lived).
      order = prior;
    } else {
      // Create a new pending order + items.
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

      const { data: created, error: orderErr } = await admin
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

      if (orderErr || !created) {
        console.error('[checkout/create] order insert', orderErr);
        return json(500, { success: false, errorMessage: GENERIC_SERVER_ERROR });
      }
      order = created as OrderRow;

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
        console.error('[checkout/create] order_items insert', itemsErr);
        await admin.from('orders').delete().eq('id', order.id);
        return json(500, { success: false, errorMessage: GENERIC_SERVER_ERROR });
      }
    }

    // 4. Fetch Auth.net form token.
    const origin = originOf(req);
    const token = await getHostedPaymentToken({
      orderNumber: order.order_number,
      amount: total,
      customerEmail: payload.email,
      billingAddress: payload.shippingAddress,
      shippingAddress: payload.shippingAddress,
      returnUrl: `${origin}/api/checkout/hosted-callback?orderNumber=${encodeURIComponent(order.order_number)}`,
      cancelUrl: `${origin}/checkout`,
    });

    if (!token.ok) {
      await admin.from('payment_audit_log').insert({
        order_id: order.id,
        event_type: 'hosted_token_failed',
        error_detail: token.errorMessage,
        source: 'checkout_create',
      });
      return json(502, {
        success: false,
        errorMessage: token.errorMessage || 'Payment provider rejected the request.',
      });
    }

    await admin.from('payment_audit_log').insert({
      order_id: order.id,
      event_type: 'hosted_token_issued',
      source: 'checkout_create',
    });

    return json(200, {
      success: true,
      orderNumber: order.order_number,
      formToken: token.formToken,
      hostedUrl: token.hostedUrl,
    });
  } catch (error) {
    console.error('[checkout/create] uncaught', error);
    return NextResponse.json(
      { success: false, errorMessage: GENERIC_SERVER_ERROR },
      { status: 500 },
    );
  }
}

function json(status: number, body: CreateResponse): NextResponse {
  return NextResponse.json(body, { status });
}

function originOf(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3001';
  return `${proto}://${host}`;
}

function extractIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return req.ip ?? 'unknown';
}
