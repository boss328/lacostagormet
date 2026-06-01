import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';
import {
  computeShipping,
  loadShippingSettings,
  round2,
} from '@/lib/checkout/pricing';
import { notifyOrderPlaced } from '@/lib/email/notify-order-placed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/create
 *
 * Admin places an order on behalf of a customer — phone order, repeat
 * customer, or any path that doesn't run through the public hosted
 * checkout. Payment is handled offline (Auth.net portal, invoice, or
 * marked as already received); this endpoint never touches Auth.net.
 *
 * Order is written with source='manual'. status is 'paid' if the admin
 * confirms payment was captured outside the site (toggle), otherwise
 * 'pending' so it shows up in the same backlog as customer-abandoned
 * orders until the admin flips it.
 *
 * Per-line price overrides: each item.unitPrice (if positive) wins over
 * the product's retail_price. Used for negotiated B2B pricing, comp'd
 * lines, or rounding favours.
 */

type AddressInput = {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
};

type ItemInput = {
  productId: string;
  quantity: number;
  unitPrice?: number;
};

type Payload = {
  customerEmail: string;
  shippingAddress: AddressInput;
  items: ItemInput[];
  shippingCostOverride?: number;
  markAsPaid: boolean;
  adminNote?: string;
  sendCustomerEmail: boolean;
};

const STATE_RX = /^[A-Z]{2}$/;
const ZIP_RX = /^\d{5}(-\d{4})?$/;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bad(message: string, fieldErrors?: Record<string, string>, status = 400) {
  return NextResponse.json(
    { ok: false, errorMessage: message, fieldErrors: fieldErrors ?? null },
    { status },
  );
}

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const expected = await expectedSessionToken();
  if (!expected) return bad('Server misconfigured.', undefined, 503);
  if (cookie !== expected) return bad('Not authenticated.', undefined, 401);

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return bad('Invalid JSON.');
  }

  // ── Validate ───────────────────────────────────────────────────────
  const fieldErrors: Record<string, string> = {};
  const email = (payload.customerEmail ?? '').trim().toLowerCase();
  if (!EMAIL_RX.test(email)) fieldErrors.customerEmail = 'Valid customer email required.';

  const addr = payload.shippingAddress;
  if (!addr) {
    return bad('Shipping address required.', { shipping: 'Required.' });
  }
  if (!addr.firstName?.trim()) fieldErrors['shipping.firstName'] = 'First name required.';
  if (!addr.lastName?.trim()) fieldErrors['shipping.lastName'] = 'Last name required.';
  if (!addr.address1?.trim()) fieldErrors['shipping.address1'] = 'Street address required.';
  if (!addr.city?.trim()) fieldErrors['shipping.city'] = 'City required.';
  if (!STATE_RX.test(addr.state?.trim() ?? '')) fieldErrors['shipping.state'] = 'State as 2-letter code.';
  if (!ZIP_RX.test(addr.zip?.trim() ?? '')) fieldErrors['shipping.zip'] = 'Valid ZIP required.';
  if (!addr.phone?.trim()) fieldErrors['shipping.phone'] = 'Phone required.';

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    fieldErrors.items = 'At least one line item.';
  } else {
    payload.items.forEach((it, idx) => {
      if (!it.productId) fieldErrors[`items.${idx}.product`] = 'Pick a product.';
      if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
        fieldErrors[`items.${idx}.quantity`] = 'Quantity must be a positive integer.';
      }
      if (it.unitPrice != null) {
        if (!Number.isFinite(it.unitPrice) || it.unitPrice < 0) {
          fieldErrors[`items.${idx}.unitPrice`] = 'Override price must be ≥ 0.';
        } else if (Math.round(it.unitPrice * 100) !== it.unitPrice * 100) {
          fieldErrors[`items.${idx}.unitPrice`] = 'At most two decimals.';
        }
      }
    });
  }

  if (Object.keys(fieldErrors).length > 0) {
    return bad('Validation failed.', fieldErrors);
  }

  // ── Resolve products ───────────────────────────────────────────────
  const admin = createAdminClient();
  const productIds = payload.items.map((i) => i.productId);
  const { data: prodRows, error: prodErr } = await admin
    .from('products')
    .select('id, sku, name, retail_price, wholesale_cost, preferred_vendor_id, is_active')
    .in('id', productIds);
  if (prodErr) {
    console.error('[admin/orders/create] product lookup', prodErr);
    return bad('Could not look up products.', undefined, 500);
  }

  const productsById = new Map<string, {
    id: string;
    sku: string;
    name: string;
    retail_price: number | string;
    wholesale_cost: number | string | null;
    preferred_vendor_id: string | null;
    is_active: boolean;
  }>();
  for (const p of prodRows ?? []) productsById.set(p.id as string, p as never);

  const missing = payload.items.find((i) => !productsById.has(i.productId));
  if (missing) return bad('One or more products are no longer available.');

  // ── Build line items + totals ──────────────────────────────────────
  const lineItems = payload.items.map((i) => {
    const p = productsById.get(i.productId)!;
    const unitPrice =
      i.unitPrice != null && i.unitPrice >= 0
        ? round2(i.unitPrice)
        : round2(Number(p.retail_price));
    const lineSubtotal = round2(unitPrice * i.quantity);
    return {
      product_id: p.id,
      product_sku: p.sku,
      product_name: p.name,
      quantity: i.quantity,
      unit_price: unitPrice,
      unit_wholesale_cost:
        p.wholesale_cost == null ? null : round2(Number(p.wholesale_cost)),
      line_subtotal: lineSubtotal,
      assigned_vendor_id: p.preferred_vendor_id,
    };
  });

  const subtotal = round2(lineItems.reduce((s, l) => s + l.line_subtotal, 0));
  const shippingSettings = await loadShippingSettings();
  const shippingCost =
    payload.shippingCostOverride != null && payload.shippingCostOverride >= 0
      ? round2(payload.shippingCostOverride)
      : computeShipping(subtotal, addr.state, shippingSettings);
  const tax = 0;
  const total = round2(subtotal + shippingCost + tax);

  // ── Look up existing customer_id (optional) ────────────────────────
  const { data: existingCustomer } = await admin
    .from('customers')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  // ── Build address JSON (matches checkout/create shape) ─────────────
  const company = (addr.company ?? '').trim();
  const addressJson = {
    first_name: addr.firstName.trim(),
    last_name: addr.lastName.trim(),
    company,
    address1: addr.address1.trim(),
    address2: (addr.address2 ?? '').trim(),
    city: addr.city.trim(),
    state: addr.state.trim().toUpperCase(),
    zip: addr.zip.trim(),
    country: 'US',
    phone: addr.phone.trim(),
  };

  const status: 'paid' | 'pending' = payload.markAsPaid ? 'paid' : 'pending';
  const now = new Date().toISOString();
  const noteLines = [
    `[${now}] Manually placed by admin · status=${status}`,
    payload.adminNote?.trim() ? `Note: ${payload.adminNote.trim().slice(0, 1000)}` : null,
  ].filter(Boolean) as string[];

  // ── Insert order ───────────────────────────────────────────────────
  const { data: created, error: orderErr } = await admin
    .from('orders')
    .insert({
      customer_email: email,
      customer_id: existingCustomer?.id ?? null,
      source: 'manual',
      status,
      subtotal,
      shipping_cost: shippingCost,
      tax,
      total,
      shipping_address: addressJson,
      billing_address: addressJson,
      business_name: company || null,
      is_business: company.length > 0,
      admin_notes: noteLines.join('\n'),
    })
    .select('id, order_number, status')
    .single();

  if (orderErr || !created) {
    console.error('[admin/orders/create] order insert', orderErr);
    return bad(orderErr?.message ?? 'Could not create order.', undefined, 500);
  }

  const order = created as { id: string; order_number: string; status: string };

  // ── Insert line items ──────────────────────────────────────────────
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
    console.error('[admin/orders/create] line items insert', itemsErr);
    await admin.from('orders').delete().eq('id', order.id);
    return bad(itemsErr.message ?? 'Could not save line items.', undefined, 500);
  }

  // ── Fire-and-forget customer email if requested + paid ─────────────
  if (payload.sendCustomerEmail && status === 'paid') {
    void notifyOrderPlaced(order.id).catch((e) => {
      console.error('[admin/orders/create] email dispatch failed', e);
    });
  }

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
    },
  });
}
