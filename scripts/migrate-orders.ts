/**
 * Phase 5 — BigCommerce order migration.
 *
 * Inputs:
 *   lcg-spec/references/bigcommerce/orders-export.csv
 *   lcg-spec/references/bigcommerce/shipments-export.csv
 *
 * Outputs:
 *   orders      (one row per BC order, order_number = BC-{bc_order_id})
 *   order_items (one row per parsed product in the "Product Details" field)
 *
 * Safety:
 *   - Dry-run first (prints counts + samples, writes nothing)
 *   - Real run gated by error rate < 1%
 *   - ON CONFLICT (order_number) DO UPDATE — idempotent
 *   - Orphan orders (no matching customer) keep customer_email, customer_id=NULL
 *   - Missing SKUs log a mismatch but still insert the order_item with
 *     product_id=NULL so history is complete
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

const ORDERS_PATH = path.resolve('lcg-spec/references/bigcommerce/orders-export.csv');
const SHIPMENTS_PATH = path.resolve('lcg-spec/references/bigcommerce/shipments-export.csv');
const DRY_RUN = process.argv.includes('--dry-run');
const ERROR_THRESHOLD = 0.01;
const BATCH_SIZE = 50;

type BcOrder = Record<string, string>;

type ParsedOrder = {
  bcOrderId: string;
  orderNumber: string;
  customerEmail: string;
  customerFirstName: string;
  customerLastName: string;
  orderDate: string; // ISO date
  statusRaw: string;
  status: 'paid' | 'payment_held' | 'cancelled' | 'refunded';
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  shippingAddress: AddressJson;
  billingAddress: AddressJson;
  productDetailsRaw: string;
  items: ParsedItem[];
  shipMethod: string;
  tracking: string | null;
  shippedAt: string | null;
};

type AddressJson = {
  first_name: string;
  last_name: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
};

type ParsedItem = {
  bcProductId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
};

type ValidationIssue = { reason: string };

function readCsv(p: string): BcOrder[] {
  const buf = fs.readFileSync(p, 'utf8');
  return parseCsv(buf, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });
}

function parseUsDate(s: string): string | null {
  if (!s) return null;
  // BC uses MM/DD/YYYY or "Mar 13th 2026". Handle both.
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (slash) {
    const [, m, d, y] = slash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const monthShort: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const written = /^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})$/.exec(s.trim());
  if (written) {
    const [, m, d, y] = written;
    const mm = monthShort[m.slice(0, 3).toLowerCase()];
    if (mm) return `${y}-${mm}-${d.padStart(2, '0')}`;
  }
  return null;
}

function n(v: string): number {
  const parsed = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapStatus(s: string): ParsedOrder['status'] {
  const l = s.trim().toLowerCase();
  if (l.includes('refund')) return 'refunded';
  if (l.includes('cancel') || l.includes('declin') || l.includes('void')) return 'cancelled';
  if (l.includes('hold') || l.includes('pending') || l.includes('awaiting payment')) return 'payment_held';
  // default: shipped / completed / partially shipped / awaiting fulfillment / etc → paid
  return 'paid';
}

function mapState(raw: string): string {
  if (!raw) return '';
  const s = raw.trim();
  if (/^[A-Z]{2}$/.test(s)) return s;
  // BC exports full state names; map to USPS code.
  const map: Record<string, string> = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
    colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
    florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
    indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
    maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
    mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
    oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
    virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
    wyoming: 'WY',
  };
  return map[s.toLowerCase()] ?? s.slice(0, 2).toUpperCase();
}

function mapCountry(raw: string): string {
  const l = (raw ?? '').trim().toLowerCase();
  if (!l) return 'US';
  if (l === 'united states' || l === 'united states of america' || l === 'usa' || l === 'us') return 'US';
  if (l === 'canada' || l === 'ca') return 'CA';
  return l.slice(0, 2).toUpperCase();
}

function parseProductDetails(raw: string): ParsedItem[] {
  if (!raw) return [];
  const entries = raw.split('|').map((s) => s.trim()).filter(Boolean);
  const out: ParsedItem[] = [];
  for (const entry of entries) {
    // "Product ID: 823, Product Qty: 1, Product SKU: BT.773110, Product Name: X, ..."
    const grab = (key: string): string => {
      const re = new RegExp(`Product ${key}:\\s*([^,]*)`, 'i');
      const m = re.exec(entry);
      return m ? m[1].trim() : '';
    };
    const id = grab('ID');
    const qty = Number(grab('Qty')) || 0;
    const sku = grab('SKU');
    const name = grab('Name');
    const unitPriceStr = grab('Unit Price');
    const totalStr = grab('Total Price');
    const unitPrice = n(unitPriceStr);
    const lineSubtotal = n(totalStr);
    if (!sku && !name) continue;
    out.push({
      bcProductId: id,
      sku: sku || '',
      name: name || sku || '(unnamed)',
      quantity: qty,
      unitPrice,
      lineSubtotal: lineSubtotal || unitPrice * qty,
    });
  }
  return out;
}

function validate(
  orders: BcOrder[],
  shipments: Map<string, { trackingNo: string; shippedAt: string }>,
): { parsed: ParsedOrder[]; issues: ValidationIssue[] } {
  const parsed: ParsedOrder[] = [];
  const issues: ValidationIssue[] = [];

  for (const row of orders) {
    const bcOrderId = String(row['Order ID'] ?? '').trim();
    if (!bcOrderId) {
      issues.push({ reason: 'missing_order_id' });
      continue;
    }
    const email = String(row['Customer Email'] ?? '').trim().toLowerCase();
    if (!email) {
      issues.push({ reason: 'missing_email' });
      continue;
    }
    const orderDate = parseUsDate(row['Order Date']);
    if (!orderDate) {
      issues.push({ reason: 'bad_date' });
      continue;
    }
    const statusRaw = String(row['Order Status'] ?? '');
    const total = n(row['Order Total (inc tax)']);
    if (total <= 0) {
      // treat $0 orders as cancelled/refunded — still record them
    }

    const items = parseProductDetails(String(row['Product Details'] ?? ''));
    if (items.length === 0) {
      issues.push({ reason: 'no_parseable_items' });
    }

    const shipMethod = String(row['Ship Method'] ?? '').trim();
    const ship = shipments.get(bcOrderId);

    const shippingAddress: AddressJson = {
      first_name: String(row['Shipping First Name'] ?? '').trim(),
      last_name: String(row['Shipping Last Name'] ?? '').trim(),
      company: String(row['Shipping Company'] ?? '').trim() || undefined,
      address1: String(row['Shipping Street 1'] ?? '').trim(),
      address2: String(row['Shipping Street 2'] ?? '').trim() || undefined,
      city: String(row['Shipping Suburb'] ?? '').trim(),
      state: mapState(String(row['Shipping State'] ?? '')),
      zip: String(row['Shipping Zip'] ?? '').trim(),
      country: mapCountry(String(row['Shipping Country'] ?? '')),
      phone: String(row['Shipping Phone'] ?? '').trim() || undefined,
    };
    const billingAddress: AddressJson = {
      first_name: String(row['Billing First Name'] ?? '').trim(),
      last_name: String(row['Billing Last Name'] ?? '').trim(),
      company: String(row['Billing Company'] ?? '').trim() || undefined,
      address1: String(row['Billing Street 1'] ?? '').trim(),
      address2: String(row['Billing Street 2'] ?? '').trim() || undefined,
      city: String(row['Billing Suburb'] ?? '').trim(),
      state: mapState(String(row['Billing State'] ?? '')),
      zip: String(row['Billing Zip'] ?? '').trim(),
      country: mapCountry(String(row['Billing Country'] ?? '')),
      phone: String(row['Billing Phone'] ?? '').trim() || undefined,
    };

    parsed.push({
      bcOrderId,
      orderNumber: `BC-${bcOrderId}`,
      customerEmail: email,
      customerFirstName: String(row['Shipping First Name'] ?? row['Billing First Name'] ?? '').trim(),
      customerLastName: String(row['Shipping Last Name'] ?? row['Billing Last Name'] ?? '').trim(),
      orderDate,
      statusRaw,
      status: mapStatus(statusRaw),
      subtotal: n(row['Subtotal (inc tax)']),
      shippingCost: n(row['Shipping Cost (inc tax)']),
      tax: n(row['Tax Total']),
      total,
      shippingAddress,
      billingAddress,
      productDetailsRaw: String(row['Product Details'] ?? ''),
      items,
      shipMethod,
      tracking: ship?.trackingNo ?? null,
      shippedAt: ship?.shippedAt ?? null,
    });
  }

  return { parsed, issues };
}

function loadShipments(): Map<string, { trackingNo: string; shippedAt: string }> {
  const rows = readCsv(SHIPMENTS_PATH);
  const map = new Map<string, { trackingNo: string; shippedAt: string }>();
  for (const row of rows) {
    const orderId = String(row['ORDER ID'] ?? row['Order ID'] ?? '').trim();
    if (!orderId) continue;
    const shippedRaw = String(row['DATE SHIPPED'] ?? row['Date Shipped'] ?? '').trim();
    const tracking = String(row['TRACKING NO'] ?? row['Tracking No'] ?? '').trim();
    const shippedAt = parseUsDate(shippedRaw) ?? shippedRaw;
    // Keep the most recent shipment per order
    map.set(orderId, { trackingNo: tracking, shippedAt });
  }
  return map;
}

function printDryRunReport(total: number, parsed: ParsedOrder[], issues: ValidationIssue[]) {
  const errorRate = total === 0 ? 0 : issues.length / total;
  console.log('========================================');
  console.log('  ORDER MIGRATION DRY RUN');
  console.log('========================================');
  console.log(`Total rows in CSV:    ${total}`);
  console.log(`Parseable orders:     ${parsed.length}`);
  console.log(`Validation issues:    ${issues.length}`);
  console.log(`Error rate:           ${(errorRate * 100).toFixed(3)}%`);
  console.log(`Threshold:            ${(ERROR_THRESHOLD * 100).toFixed(2)}%`);
  console.log(`Would proceed:        ${errorRate < ERROR_THRESHOLD ? 'YES' : 'NO (abort)'}`);

  const issueBreakdown = new Map<string, number>();
  for (const i of issues) issueBreakdown.set(i.reason, (issueBreakdown.get(i.reason) ?? 0) + 1);
  if (issueBreakdown.size > 0) {
    console.log('');
    console.log('Issue breakdown:');
    for (const [r, c] of issueBreakdown) console.log(`  ${r}: ${c}`);
  }

  const statusBreakdown = new Map<string, number>();
  for (const p of parsed) statusBreakdown.set(p.status, (statusBreakdown.get(p.status) ?? 0) + 1);
  console.log('');
  console.log('Order status mapping:');
  for (const [s, c] of statusBreakdown) console.log(`  ${s}: ${c}`);

  const totalRevenue = parsed.reduce((sum, p) => sum + p.total, 0);
  console.log('');
  console.log(`Total historical revenue: $${totalRevenue.toFixed(2)}`);

  const firstItemSample = parsed.find((p) => p.items.length > 0);
  console.log('');
  console.log('Sample order (PII redacted):');
  if (firstItemSample) {
    const domain = firstItemSample.customerEmail.split('@')[1] ?? '?';
    console.log(`  ${firstItemSample.orderNumber}  date=${firstItemSample.orderDate}  ` +
      `customer=***@${domain}  total=$${firstItemSample.total.toFixed(2)}  ` +
      `items=${firstItemSample.items.length}  status=${firstItemSample.status}`);
    for (const it of firstItemSample.items.slice(0, 3)) {
      console.log(`    sku=${it.sku}  qty=${it.quantity}  unit=$${it.unitPrice.toFixed(2)}`);
    }
  }
  console.log('========================================');
  return { errorRate };
}

async function runReal(parsed: ParsedOrder[]) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) throw new Error('Missing Supabase env vars');
  const admin = createClient(supaUrl, supaKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('');
  console.log('========================================');
  console.log('  ORDER MIGRATION REAL RUN');
  console.log('========================================');

  // 1) Build email → customer_id + sku → product_id lookup.
  const { data: customerRows } = await admin
    .from('customers')
    .select('id, email')
    .limit(20000);
  const custByEmail = new Map<string, string>();
  for (const r of (customerRows ?? []) as { id: string; email: string }[]) {
    custByEmail.set(r.email.toLowerCase(), r.id);
  }
  console.log(`Customer lookup: ${custByEmail.size} customers loaded`);

  const { data: productRows } = await admin.from('products').select('id, sku').limit(2000);
  const productBySku = new Map<string, string>();
  for (const r of (productRows ?? []) as { id: string; sku: string }[]) {
    productBySku.set(r.sku, r.id);
  }
  console.log(`Product lookup:  ${productBySku.size} products loaded`);
  console.log('');

  let orderInserts = 0;
  let orderUpdates = 0;
  let orderFails = 0;
  let orphanOrders = 0;
  let itemInserts = 0;
  let skuMismatches = 0;
  const failures: string[] = [];
  const started = Date.now();

  for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
    const batch = parsed.slice(i, i + BATCH_SIZE);

    // Upsert orders batch-wise.
    const orderPayload = batch.map((p) => {
      const cid = custByEmail.get(p.customerEmail) ?? null;
      if (!cid) orphanOrders += 1;
      return {
        order_number: p.orderNumber,
        source: 'migrated' as const,
        source_order_id: p.bcOrderId,
        customer_id: cid,
        customer_email: p.customerEmail,
        status: p.status,
        // Historical BC orders are years old — treat paid orders as delivered.
        // Cancelled/refunded orders stay at fulfillment_status default (unfulfilled).
        fulfillment_status: p.status === 'paid' ? 'delivered' : 'unfulfilled',
        subtotal: p.subtotal,
        shipping_cost: p.shippingCost,
        tax: p.tax,
        total: p.total,
        shipping_address: p.shippingAddress,
        billing_address: p.billingAddress,
        legacy_bc_order_id: p.bcOrderId,
        admin_notes: `Migrated from BC ${p.orderDate}${p.tracking ? ` · ${p.tracking}` : ''}`,
      };
    });

    const { data: upsertedOrders, error: orderErr } = await admin
      .from('orders')
      .upsert(orderPayload, { onConflict: 'order_number' })
      .select('id, order_number');

    if (orderErr) {
      orderFails += batch.length;
      failures.push(`order_batch:${orderErr.code ?? orderErr.message}`);
      console.error(`  batch ${i}-${i + batch.length} failed: ${orderErr.message}`);
      continue;
    }

    const orderIdByNumber = new Map<string, string>();
    for (const r of (upsertedOrders ?? []) as { id: string; order_number: string }[]) {
      orderIdByNumber.set(r.order_number, r.id);
    }
    orderInserts += (upsertedOrders ?? []).length;

    // Delete existing order_items for re-run idempotency on this batch, then insert fresh.
    const orderIds = Array.from(orderIdByNumber.values());
    if (orderIds.length > 0) {
      await admin.from('order_items').delete().in('order_id', orderIds);
    }

    const itemPayload: Array<Record<string, unknown>> = [];
    for (const p of batch) {
      const orderId = orderIdByNumber.get(p.orderNumber);
      if (!orderId) continue;
      for (const it of p.items) {
        const pid = it.sku ? productBySku.get(it.sku) ?? null : null;
        if (it.sku && !pid) skuMismatches += 1;
        itemPayload.push({
          order_id: orderId,
          product_id: pid,
          product_sku: it.sku || 'UNKNOWN',
          product_name: it.name,
          quantity: it.quantity || 1,
          unit_price: it.unitPrice,
          unit_wholesale_cost: null,
          line_subtotal: it.lineSubtotal,
          assigned_vendor_id: null,
        });
      }
    }

    if (itemPayload.length > 0) {
      const { error: itemErr } = await admin.from('order_items').insert(itemPayload);
      if (itemErr) {
        failures.push(`items:${itemErr.code ?? itemErr.message}`);
      } else {
        itemInserts += itemPayload.length;
      }
    }

    if (i % (BATCH_SIZE * 10) === 0) {
      const pct = Math.round(((i + batch.length) / parsed.length) * 100);
      const elapsed = Math.round((Date.now() - started) / 1000);
      console.log(`  … ${i + batch.length}/${parsed.length} (${pct}%, ${elapsed}s)`);
    }
  }

  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log('');
  console.log('Done in', elapsed, 'seconds.');
  console.log('');
  console.log(`orders upserted:     ${orderInserts}`);
  console.log(`orders failed:       ${orderFails}`);
  console.log(`orphan orders (no customer FK): ${orphanOrders}`);
  console.log(`order_items inserted: ${itemInserts}`);
  console.log(`sku mismatches:      ${skuMismatches}`);

  if (failures.length > 0) {
    const counts = new Map<string, number>();
    for (const f of failures) counts.set(f, (counts.get(f) ?? 0) + 1);
    console.log('');
    console.log('Failure breakdown:');
    for (const [k, v] of counts) console.log(`  ${k}: ${v}`);
  }

  // updateOrderCount silence
  void orderUpdates;
}

async function main() {
  console.log('Loading shipments index…');
  const shipments = loadShipments();
  console.log(`  ${shipments.size} shipment rows indexed`);

  console.log('Loading orders CSV…');
  const orders = readCsv(ORDERS_PATH);
  console.log(`  ${orders.length} order rows`);

  const { parsed, issues } = validate(orders, shipments);
  const report = printDryRunReport(orders.length, parsed, issues);

  if (DRY_RUN) {
    console.log('(dry run only — no DB writes)');
    return;
  }

  if (report.errorRate >= ERROR_THRESHOLD) {
    console.error('ABORT — error rate above threshold.');
    process.exit(1);
  }

  await runReal(parsed);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  try {
    fs.writeFileSync('/tmp/phase5-migration-error.log', String(e?.stack ?? e));
  } catch {}
  process.exit(1);
});
