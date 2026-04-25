import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Vendor purchase-order primitives.
 *
 * Drafting model: when an order transitions to 'paid', group its line items
 * by `assigned_vendor_id` (or fall back to product.preferred_vendor_id),
 * and create one `vendor_orders` row per vendor with status='pending'
 * (draft). Jeff reviews each one and clicks Send.
 *
 * Why we reuse vendor_orders (not the spec's vendor_purchase_orders):
 *   the existing schema already had everything we need, including the
 *   email_subject/email_body/email_sent_at columns. The migration adds
 *   warehouse_id, sent_by, total_wholesale plus a vendor_warehouses table.
 *
 * Status mapping (DB enum vendor_order_status → friendly UI label):
 *   pending   → "draft"
 *   sent      → "sent"
 *   confirmed → "acknowledged"
 *   shipped   → "shipped"
 *   cancelled → "cancelled"
 */

export type VendorOrderStatus = 'pending' | 'sent' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

export const STATUS_LABEL: Record<VendorOrderStatus, string> = {
  pending: 'draft',
  sent: 'sent',
  confirmed: 'acknowledged',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

export const STATUS_COLOR: Record<VendorOrderStatus, string> = {
  pending:   'var(--color-brand-deep)',
  sent:      'var(--color-gold)',
  confirmed: 'var(--color-cream)',
  shipped:   'var(--color-ink-2)',
  delivered: 'var(--color-forest)',
  cancelled: 'var(--color-ink-muted)',
};

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function humanizeQty(qty: number): string {
  return qty < NUMBER_WORDS.length ? NUMBER_WORDS[qty] : String(qty);
}

function caseWord(qty: number): string {
  return qty === 1 ? 'case' : 'cases';
}

type ShippingAddress = {
  first_name?: string;
  last_name?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
};

type LineItem = {
  product_id: string | null;
  product_sku: string;
  product_name: string;
  quantity: number;
  unit_wholesale_cost: number | string | null;
};

type Warehouse = {
  id: string;
  label: string;
  city: string | null;
  state: string | null;
  is_primary: boolean;
};

export type DraftEmailInput = {
  orderNumber: string;
  shippingAddress: ShippingAddress;
  items: LineItem[];
  warehouseLabel: string | null;
};

/** Compose the subject + body for a vendor PO email. */
export function composeDraftEmail(input: DraftEmailInput): { subject: string; body: string } {
  const subject = `Fwd: La Costa Gourmet PO ${input.orderNumber}`;

  const totalUnits = input.items.reduce((s, i) => s + i.quantity, 0);
  const itemCountPhrase = `${humanizeQty(totalUnits)} ${caseWord(totalUnits)}`;

  const itemNames =
    input.items.length === 1
      ? input.items[0].product_name
      : input.items
          .map((i, idx, arr) =>
            idx === arr.length - 1 ? `and ${i.product_name}` : i.product_name,
          )
          .join(arr2Sep(input.items.length));

  const lines: string[] = [];
  lines.push(`Please drop ship ${itemCountPhrase} of ${itemNames}:`);
  lines.push('');
  for (const item of input.items) {
    lines.push(`${item.quantity} × ${item.product_name}`);
    lines.push(`SKU#: ${item.product_sku}`);
  }
  lines.push('');
  if (input.warehouseLabel) {
    lines.push(`Drop ship from: ${input.warehouseLabel}`);
    lines.push('');
  }
  lines.push('Drop ship address:');
  const ship = input.shippingAddress;
  const fullName = [ship.first_name, ship.last_name].filter(Boolean).join(' ');
  if (fullName) lines.push(fullName);
  if (ship.street1) lines.push(ship.street1);
  if (ship.street2) lines.push(ship.street2);
  if (ship.city || ship.state || ship.postal_code) {
    lines.push(
      `${ship.city ?? ''}${ship.city && ship.state ? ', ' : ''}${ship.state ?? ''} ${ship.postal_code ?? ''}`.trim(),
    );
  }
  lines.push('');
  lines.push('Thanks,');
  lines.push('La Costa Gourmet');
  lines.push('(858) 354-1120');

  return { subject, body: lines.join('\n') };
}

function arr2Sep(n: number): string {
  return n > 2 ? ', ' : ' ';
}

/**
 * Auto-draft vendor POs for a paid order. Idempotent: if any vendor_orders
 * already exist for the order, this is a no-op (we don't replace human edits).
 *
 * Returns the number of POs created. Errors are logged but never thrown —
 * this runs fire-and-forget from the payment callback so customer flow
 * is never impacted.
 */
export async function autoDraftVendorPosForOrder(orderId: string): Promise<number> {
  const admin = createAdminClient();

  // Idempotency check
  const { data: existing } = await admin
    .from('vendor_orders')
    .select('id')
    .eq('order_id', orderId)
    .limit(1);
  if (existing && existing.length > 0) return 0;

  // Order header (we need shipping_address + order_number)
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, order_number, shipping_address')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr || !order) {
    console.error('[vendor-po] order lookup failed', orderErr);
    return 0;
  }
  const orderRow = order as {
    id: string;
    order_number: string;
    shipping_address: ShippingAddress | null;
  };

  // Pull line items joined to product so we can resolve preferred_vendor_id
  // when the order_item didn't already get an assigned_vendor_id.
  const { data: items, error: itemsErr } = await admin
    .from('order_items')
    .select(
      'product_id, product_sku, product_name, quantity, unit_wholesale_cost, assigned_vendor_id, products(preferred_vendor_id)',
    )
    .eq('order_id', orderId);
  if (itemsErr || !items) {
    console.error('[vendor-po] items lookup failed', itemsErr);
    return 0;
  }

  // Group by effective vendor id (assigned_vendor_id ?? products.preferred_vendor_id)
  type Row = LineItem & {
    assigned_vendor_id: string | null;
    products: { preferred_vendor_id: string | null } | null;
  };
  const grouped = new Map<string, LineItem[]>();
  for (const it of items as unknown as Row[]) {
    const vendorId = it.assigned_vendor_id ?? it.products?.preferred_vendor_id ?? null;
    if (!vendorId) continue; // skip items with no vendor (admin will see them missing in UI)
    const arr = grouped.get(vendorId) ?? [];
    arr.push({
      product_id: it.product_id,
      product_sku: it.product_sku,
      product_name: it.product_name,
      quantity: it.quantity,
      unit_wholesale_cost: it.unit_wholesale_cost,
    });
    grouped.set(vendorId, arr);
  }
  if (grouped.size === 0) return 0;

  // Pull primary warehouses for the relevant vendors in one query
  const vendorIds = Array.from(grouped.keys());
  const { data: warehouses } = await admin
    .from('vendor_warehouses')
    .select('id, vendor_id, label, city, state, is_primary')
    .in('vendor_id', vendorIds);
  const primaryByVendor = new Map<string, Warehouse>();
  for (const w of (warehouses ?? []) as Array<Warehouse & { vendor_id: string }>) {
    if (w.is_primary && !primaryByVendor.has(w.vendor_id)) {
      primaryByVendor.set(w.vendor_id, w);
    }
  }

  let created = 0;
  const entries = Array.from(grouped.entries());
  for (const [vendorId, lineItems] of entries) {
    const warehouse = primaryByVendor.get(vendorId) ?? null;
    const warehouseLabel = warehouse?.label ?? null;
    const { subject, body } = composeDraftEmail({
      orderNumber: orderRow.order_number,
      shippingAddress: orderRow.shipping_address ?? {},
      items: lineItems,
      warehouseLabel,
    });
    const totalWholesale = lineItems.reduce(
      (s: number, i: LineItem) =>
        s + (i.unit_wholesale_cost == null ? 0 : Number(i.unit_wholesale_cost)) * i.quantity,
      0,
    );

    // Stamp the assigned_vendor_id on each order_item if it was previously null
    // (so the order detail UI groups items the same way).
    void admin
      .from('order_items')
      .update({ assigned_vendor_id: vendorId })
      .eq('order_id', orderRow.id)
      .is('assigned_vendor_id', null)
      .in(
        'product_sku',
        lineItems.map((i: LineItem) => i.product_sku),
      );

    const { error: insErr } = await admin.from('vendor_orders').insert({
      order_id: orderRow.id,
      vendor_id: vendorId,
      warehouse_id: warehouse?.id ?? null,
      status: 'pending',
      email_subject: subject,
      email_body: body,
      total_wholesale: Math.round(totalWholesale * 100) / 100,
    });
    if (insErr) {
      console.error('[vendor-po] insert failed for vendor', vendorId, insErr);
      continue;
    }
    created += 1;
  }

  return created;
}
