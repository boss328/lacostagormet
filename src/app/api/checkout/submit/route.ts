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
import { safeJson } from '@/lib/authnet/safe-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SubmitResponse =
  | { success: true; orderNumber: string; status: string; warning?: string }
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

type AdminClient = ReturnType<typeof createAdminClient>;

type DbOp<T> =
  | { ok: true; value: T }
  | { ok: false; errorCode: string | null; errorMessage: string };

const GENERIC_CART_ERROR =
  'One or more items in your cart are no longer available. Please review your cart and try again.';
const GENERIC_SERVER_ERROR =
  'Something went wrong. Your card was not charged. Please try again.';

/**
 * POST /api/checkout/submit
 *
 * Failure-mode contract (the fix for the Phase 4 silent bug):
 *   - Auth.net DECLINED / ERROR / NETWORK: no money moved, return failure
 *     to the client. No order status transition beyond what already happened.
 *   - Auth.net APPROVED + payments INSERT FAILED: money moved. Return
 *     success with warning:"payment_record_failed". Order stays status=
 *     'pending' so admin can see the exception row via payment_audit_log.
 *     Never rollback, never auto-void.
 *   - Auth.net APPROVED + payments INSERT OK + orders UPDATE FAILED:
 *     money moved, audit trail intact. Return success with warning:
 *     "status_update_failed". Reconciler (Phase 7) repairs the status.
 *   - Auth.net APPROVED + all writes OK: return plain success.
 *
 * The audit entry is the minimum viable record. If audit_log INSERT
 * itself fails we console.error and proceed — the charge still happened
 * and the customer still gets their order number.
 */
export async function POST(req: NextRequest) {
  try {
    let payload: CheckoutSubmitPayload;
    try {
      const body = await req.json();
      payload = checkoutSubmitSchema.parse(body);
    } catch (parseErr) {
      console.error('[checkout] validation failed', parseErr);
      return json(400, { success: false, errorMessage: 'Invalid checkout request.' });
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
    if (payload.items.find((i) => !productsById.has(i.product_id))) {
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
    // 3. Idempotency — recent order with same cart + IP.
    // -------------------------------------------------------------------------
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
      console.error('[checkout] idempotency lookup', recentErr);
      return json(500, { success: false, errorMessage: GENERIC_SERVER_ERROR });
    }

    const prior: OrderRow | null = (recent?.[0] as OrderRow | undefined) ?? null;
    if (prior) {
      if (prior.status === 'paid')
        return json(200, { success: true, orderNumber: prior.order_number, status: 'paid' });
      if (prior.status === 'payment_held')
        return json(200, {
          success: true,
          orderNumber: prior.order_number,
          status: 'payment_held',
        });
      if (prior.status === 'pending')
        return json(200, { success: true, orderNumber: prior.order_number, status: 'pending' });
      // 'cancelled' → fall through and create fresh.
    }

    // -------------------------------------------------------------------------
    // 4. Create orders + order_items rows.
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
      // Safe pre-charge rollback: no money has moved yet.
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

    const amountCents = Math.round(total * 100);

    // Non-approval outcomes: no money moved (declined/network) or held
    // (money held in Auth.net's system pending review). Audit + return.
    if (charge.outcome !== 'approved' && charge.outcome !== 'held_for_review') {
      await writeAudit(admin, {
        orderId: order.id,
        eventType:
          charge.outcome === 'declined'
            ? 'auth_net_declined'
            : charge.outcome === 'network_error'
              ? 'auth_net_network_error'
              : 'auth_net_error',
        transactionId: charge.transactionId,
        amountCents,
        rawResponse: charge.rawResponse,
        errorDetail: charge.responseReason ?? null,
      });
      // Order stays status='pending'; admin can see the audit row. We don't
      // auto-cancel because we might want to retry within the cart_hash
      // window (cancelled orders fall through to a fresh attempt).
      const updateRes = await dbUpdateOrderStatus(admin, order.id, 'cancelled');
      if (!updateRes.ok) {
        console.error('[checkout] post-decline status update failed', updateRes.errorMessage);
      }
      return json(200, { success: false, errorMessage: charge.customerMessage });
    }

    // -------------------------------------------------------------------------
    // 6. Approved / held: MONEY HAS MOVED (or been held at Auth.net).
    //    Write payments row + audit row. Never fail the client from here.
    // -------------------------------------------------------------------------
    const paymentInsert = await dbInsertPayment(admin, order.id, total, charge);
    const nextStatus = charge.outcome === 'approved' ? 'paid' : 'payment_held';

    if (!paymentInsert.ok) {
      // Leave order at 'pending' so the admin sees a loud exception state.
      await writeAudit(admin, {
        orderId: order.id,
        eventType: 'payment_insert_failed',
        transactionId: charge.transactionId,
        amountCents,
        rawResponse: charge.rawResponse,
        errorDetail: paymentInsert.errorMessage,
      });
      return json(200, {
        success: true,
        orderNumber: order.order_number,
        status: 'pending',
        warning: 'payment_record_failed',
      });
    }

    // Payments row written. Try to flip status.
    const statusUpdate = await dbUpdateOrderStatus(admin, order.id, nextStatus);
    if (!statusUpdate.ok) {
      await writeAudit(admin, {
        orderId: order.id,
        eventType: 'status_update_failed',
        transactionId: charge.transactionId,
        amountCents,
        rawResponse: charge.rawResponse,
        errorDetail: `intended='${nextStatus}'; ${statusUpdate.errorMessage}`,
      });
      return json(200, {
        success: true,
        orderNumber: order.order_number,
        status: nextStatus, // client-visible claim; reconciler will repair DB
        warning: 'status_update_failed',
      });
    }

    // Happy path audit entry.
    await writeAudit(admin, {
      orderId: order.id,
      eventType: 'payment_inserted',
      transactionId: charge.transactionId,
      amountCents,
      rawResponse: charge.rawResponse,
      errorDetail: null,
    });

    return json(200, {
      success: true,
      orderNumber: order.order_number,
      status: nextStatus,
    });
  } catch (error) {
    console.error('[checkout] uncaught', error);
    return NextResponse.json(
      { success: false, errorMessage: GENERIC_SERVER_ERROR },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DB helpers — return a DbOp<T> so callers can branch on failure.
// ---------------------------------------------------------------------------

async function dbInsertPayment(
  admin: AdminClient,
  orderId: string,
  amount: number,
  charge: ChargeResult,
): Promise<DbOp<true>> {
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
    console.error('[checkout] payments insert failed', error);
    return { ok: false, errorCode: error.code ?? null, errorMessage: error.message ?? 'unknown' };
  }
  return { ok: true, value: true };
}

async function dbUpdateOrderStatus(
  admin: AdminClient,
  orderId: string,
  nextStatus: 'paid' | 'payment_held' | 'cancelled' | 'pending',
): Promise<DbOp<true>> {
  const { error } = await admin
    .from('orders')
    .update({ status: nextStatus })
    .eq('id', orderId);
  if (error) {
    console.error('[checkout] order status update failed', error);
    return { ok: false, errorCode: error.code ?? null, errorMessage: error.message ?? 'unknown' };
  }
  return { ok: true, value: true };
}

type AuditInput = {
  orderId: string;
  eventType: string;
  transactionId: string | null;
  amountCents: number | null;
  rawResponse: unknown;
  errorDetail: string | null;
};

async function writeAudit(admin: AdminClient, input: AuditInput): Promise<void> {
  try {
    const { error } = await admin.from('payment_audit_log').insert({
      order_id: input.orderId,
      event_type: input.eventType,
      transaction_id: input.transactionId,
      amount_cents: input.amountCents,
      raw_response: safeJson(input.rawResponse),
      error_detail: input.errorDetail,
      source: 'checkout_api',
    });
    if (error) {
      console.error('[checkout] payment_audit_log insert failed', error, {
        orderId: input.orderId,
        eventType: input.eventType,
      });
    }
  } catch (e) {
    // Last-resort catch — audit must never throw out of the checkout handler.
    console.error('[checkout] payment_audit_log threw', e);
  }
}

// ---------------------------------------------------------------------------
// Primitive helpers
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
