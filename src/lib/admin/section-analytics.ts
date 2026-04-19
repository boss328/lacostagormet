import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Range, Grain } from '@/lib/admin/range';

/**
 * Range-aware analytics for the inner admin sections (orders / customers /
 * products). All loaders accept a Range — `since=null` means all-time.
 *
 * Kept in a separate file from the dashboard's analytics.ts so the
 * dashboard widgets stay simple and the section pages can lazy-load only
 * what they render. Rule: no joins beyond what the existing schema gives
 * us — the dashboard taught us that 30k-row order_items selects work fine
 * over the service-role connection.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const pageSize = 1000;

function bucketKey(iso: string, grain: Grain): string {
  if (grain === 'day') return iso.slice(0, 10);
  if (grain === 'month') return iso.slice(0, 7);
  // week — Monday-anchored ISO week start
  const d = new Date(iso);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

// ----------------------------- ORDERS ---------------------------------------

export type OrdersHeadline = {
  ordersCount: number;
  revenue: number;
  aov: number;
  priorOrdersCount: number | null;
  priorRevenue: number | null;
  priorAov: number | null;
};

export type OrdersVolumePoint = { bucket: string; orders: number; revenue: number };
export type StatusSlice = { status: string; count: number };
export type FulfillmentTimeBucket = { label: string; count: number };

export async function loadOrdersSection(range: Range): Promise<{
  headline: OrdersHeadline;
  volume: OrdersVolumePoint[];
  statuses: StatusSlice[];
  shipTimes: FulfillmentTimeBucket[];
}> {
  const admin = createAdminClient();

  async function pageOrders(since: string | null, until: string | null) {
    const all: Array<{
      total: number | string;
      created_at: string;
      status: string;
      fulfillment_status: string;
    }> = [];
    for (let from = 0; ; from += pageSize) {
      let q = admin
        .from('orders')
        .select('total, created_at, status, fulfillment_status')
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);
      if (since) q = q.gte('created_at', since);
      if (until) q = q.lt('created_at', until);
      const { data } = await q;
      const rows = data ?? [];
      all.push(...(rows as typeof all));
      if (rows.length < pageSize) break;
    }
    return all;
  }

  const [curr, prior] = await Promise.all([
    pageOrders(range.since, range.until),
    range.priorSince ? pageOrders(range.priorSince, range.priorUntil) : Promise.resolve(null),
  ]);

  const paidCurr = curr.filter((r) => r.status === 'paid' || r.status === 'payment_held');
  const revenue = round2(paidCurr.reduce((s, r) => s + Number(r.total ?? 0), 0));
  const ordersCount = paidCurr.length;
  const aov = ordersCount > 0 ? round2(revenue / ordersCount) : 0;

  const paidPrior = prior?.filter((r) => r.status === 'paid' || r.status === 'payment_held') ?? null;
  const priorRevenue = paidPrior
    ? round2(paidPrior.reduce((s, r) => s + Number(r.total ?? 0), 0))
    : null;
  const priorOrdersCount = paidPrior?.length ?? null;
  const priorAov =
    paidPrior && priorOrdersCount && priorOrdersCount > 0
      ? round2((priorRevenue ?? 0) / priorOrdersCount)
      : null;

  // Volume series (paid orders only)
  const volMap = new Map<string, { orders: number; revenue: number }>();
  for (const r of paidCurr) {
    const k = bucketKey(r.created_at, range.grain);
    const prev = volMap.get(k) ?? { orders: 0, revenue: 0 };
    prev.orders += 1;
    prev.revenue += Number(r.total ?? 0);
    volMap.set(k, prev);
  }
  const volume = Array.from(volMap.entries())
    .map(([bucket, v]) => ({ bucket, orders: v.orders, revenue: round2(v.revenue) }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));

  // Status breakdown
  const statusMap = new Map<string, number>();
  for (const r of curr) statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + 1);
  const statuses = Array.from(statusMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  // Ship-time buckets — gap between created_at and updated_at on paid + shipped orders.
  // Without explicit shipped_at on orders, we use the surrogate of fulfillment_status
  // moving to shipped/delivered. Approximate with updated_at as a proxy.
  const shippedRows: Array<{ created_at: string; updated_at?: string }> = [];
  if (paidCurr.length > 0) {
    for (let from = 0; ; from += pageSize) {
      let q = admin
        .from('orders')
        .select('created_at, updated_at')
        .in('status', ['paid', 'payment_held'])
        .in('fulfillment_status', ['shipped', 'delivered'])
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);
      if (range.since) q = q.gte('created_at', range.since);
      if (range.until) q = q.lt('created_at', range.until);
      const { data } = await q;
      const rows = data ?? [];
      shippedRows.push(...(rows as typeof shippedRows));
      if (rows.length < pageSize) break;
    }
  }
  const shipBuckets = [
    { label: '< 1 day', count: 0, lo: 0, hi: 1 },
    { label: '1–2 days', count: 0, lo: 1, hi: 2 },
    { label: '3–5 days', count: 0, lo: 2, hi: 5 },
    { label: '6–10 days', count: 0, lo: 5, hi: 10 },
    { label: '10+ days', count: 0, lo: 10, hi: Infinity },
  ];
  for (const r of shippedRows) {
    if (!r.updated_at) continue;
    const days = (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 86_400_000;
    const b = shipBuckets.find((x) => days >= x.lo && days < x.hi);
    if (b) b.count += 1;
  }

  return {
    headline: {
      ordersCount,
      revenue,
      aov,
      priorOrdersCount,
      priorRevenue,
      priorAov,
    },
    volume,
    statuses,
    shipTimes: shipBuckets.map(({ label, count }) => ({ label, count })),
  };
}

// --------------------------- CUSTOMERS --------------------------------------

export type CustomersHeadline = {
  newCount: number;
  totalCount: number;
  priorNewCount: number | null;
};

export type AcquisitionPoint = { bucket: string; newCustomers: number; returning: number };
export type LtvSlice = { label: string; count: number };
export type TopSpender = { email: string; total: number; orders: number };

export async function loadCustomersSection(range: Range): Promise<{
  headline: CustomersHeadline;
  acquisition: AcquisitionPoint[];
  ltvBuckets: LtvSlice[];
  topSpenders: TopSpender[];
}> {
  const admin = createAdminClient();

  async function pageCustomers(since: string | null, until: string | null) {
    const all: Array<{ created_at: string }> = [];
    for (let from = 0; ; from += pageSize) {
      let q = admin
        .from('customers')
        .select('created_at')
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);
      if (since) q = q.gte('created_at', since);
      if (until) q = q.lt('created_at', until);
      const { data } = await q;
      const rows = data ?? [];
      all.push(...(rows as typeof all));
      if (rows.length < pageSize) break;
    }
    return all;
  }

  // Pull all customers + all orders for LTV/top-spenders (lifetime, not range-scoped)
  const [newCustomers, priorNew, totalRes, ordersAll] = await Promise.all([
    pageCustomers(range.since, range.until),
    range.priorSince ? pageCustomers(range.priorSince, range.priorUntil) : Promise.resolve(null),
    admin.from('customers').select('id', { count: 'exact', head: true }),
    (async () => {
      const all: Array<{ customer_email: string; total: number | string; created_at: string }> = [];
      for (let from = 0; ; from += pageSize) {
        const { data } = await admin
          .from('orders')
          .select('customer_email, total, created_at')
          .in('status', ['paid', 'payment_held'])
          .range(from, from + pageSize - 1);
        const rows = data ?? [];
        all.push(...(rows as typeof all));
        if (rows.length < pageSize) break;
      }
      return all;
    })(),
  ]);

  // New-vs-returning chart needs first-purchase per email (in window)
  const firstOrder = new Map<string, string>();
  for (const o of ordersAll) {
    const e = (o.customer_email ?? '').toLowerCase();
    if (!e) continue;
    if (!firstOrder.has(e) || o.created_at < firstOrder.get(e)!) firstOrder.set(e, o.created_at);
  }
  const ordersInWindow = ordersAll.filter((o) => {
    if (range.since && o.created_at < range.since) return false;
    if (range.until && o.created_at >= range.until) return false;
    return true;
  });
  const acqMap = new Map<string, { newCustomers: number; returning: number }>();
  for (const o of ordersInWindow) {
    const e = (o.customer_email ?? '').toLowerCase();
    const k = bucketKey(o.created_at, range.grain);
    const prev = acqMap.get(k) ?? { newCustomers: 0, returning: 0 };
    if (firstOrder.get(e) === o.created_at) prev.newCustomers += 1;
    else prev.returning += 1;
    acqMap.set(k, prev);
  }
  const acquisition = Array.from(acqMap.entries())
    .map(([bucket, v]) => ({ bucket, ...v }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));

  // LTV (lifetime — not range-scoped, that's what makes it LTV)
  const ltv = new Map<string, { total: number; orders: number }>();
  for (const o of ordersAll) {
    const e = (o.customer_email ?? '').toLowerCase();
    if (!e) continue;
    const prev = ltv.get(e) ?? { total: 0, orders: 0 };
    prev.total += Number(o.total ?? 0);
    prev.orders += 1;
    ltv.set(e, prev);
  }
  const ltvBuckets = [
    { label: '$0–100',   lo: 0,    hi: 100,    count: 0 },
    { label: '$100–500', lo: 100,  hi: 500,    count: 0 },
    { label: '$500–1k',  lo: 500,  hi: 1000,   count: 0 },
    { label: '$1k–5k',   lo: 1000, hi: 5000,   count: 0 },
    { label: '$5k+',     lo: 5000, hi: Infinity, count: 0 },
  ];
  ltv.forEach((v) => {
    const b = ltvBuckets.find((x) => v.total >= x.lo && v.total < x.hi);
    if (b) b.count += 1;
  });

  const topSpenders = Array.from(ltv.entries())
    .map(([email, v]) => ({ email, total: round2(v.total), orders: v.orders }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return {
    headline: {
      newCount: newCustomers.length,
      totalCount: totalRes.count ?? 0,
      priorNewCount: priorNew?.length ?? null,
    },
    acquisition,
    ltvBuckets: ltvBuckets.map(({ label, count }) => ({ label, count })),
    topSpenders,
  };
}

// --------------------------- PRODUCTS ---------------------------------------

export type ProductsHeadline = {
  activeCount: number;
  inactiveCount: number;
  outOfStockCount: number;
  lowStockCount: number;
};

export type TopSellingProduct = {
  sku: string;
  name: string;
  units: number;
  revenue: number;
};

export type MarginSlice = { label: string; count: number };
export type NeverOrdered = { sku: string; name: string };

export async function loadProductsSection(range: Range): Promise<{
  headline: ProductsHeadline;
  topSellers: TopSellingProduct[];
  marginBuckets: MarginSlice[];
  neverOrdered: NeverOrdered[];
  brandPerformance: Array<{ brand: string; revenue: number; units: number }>;
}> {
  const admin = createAdminClient();

  const [productCounts, productsRows, orderItems] = await Promise.all([
    Promise.all([
      admin.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
      admin.from('products').select('id', { count: 'exact', head: true }).eq('is_active', false),
      admin.from('products').select('id', { count: 'exact', head: true }).eq('stock_status', 'out_of_stock'),
      admin.from('products').select('id', { count: 'exact', head: true }).eq('stock_status', 'low_stock'),
    ]),
    (async () => {
      const all: Array<{
        sku: string;
        name: string;
        retail_price: number | string;
        wholesale_cost: number | string | null;
        brand_id: string | null;
        brands: { name: string } | null;
      }> = [];
      for (let from = 0; ; from += pageSize) {
        const { data } = await admin
          .from('products')
          .select('sku, name, retail_price, wholesale_cost, brand_id, brands(name)')
          .range(from, from + pageSize - 1);
        const rows = data ?? [];
        all.push(...(rows as unknown as typeof all));
        if (rows.length < pageSize) break;
      }
      return all;
    })(),
    (async () => {
      // order_items joined to orders for status + date filter
      const all: Array<{
        product_sku: string;
        product_name: string;
        quantity: number;
        line_subtotal: number | string;
        orders: { status: string; created_at: string } | null;
      }> = [];
      for (let from = 0; ; from += pageSize) {
        let q = admin
          .from('order_items')
          .select(
            'product_sku, product_name, quantity, line_subtotal, orders!inner(status, created_at)',
          )
          .eq('orders.status', 'paid')
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1);
        if (range.since) q = q.gte('orders.created_at', range.since);
        if (range.until) q = q.lt('orders.created_at', range.until);
        const { data } = await q;
        const rows = data ?? [];
        all.push(...(rows as unknown as typeof all));
        if (rows.length < pageSize) break;
      }
      return all;
    })(),
  ]);

  const [activeRes, inactiveRes, oosRes, lowRes] = productCounts;

  // Top sellers in window
  const sellMap = new Map<string, { name: string; units: number; revenue: number }>();
  for (const r of orderItems) {
    const prev = sellMap.get(r.product_sku) ?? { name: r.product_name, units: 0, revenue: 0 };
    prev.units += r.quantity;
    prev.revenue += Number(r.line_subtotal ?? 0);
    sellMap.set(r.product_sku, prev);
  }
  const topSellers = Array.from(sellMap.entries())
    .map(([sku, v]) => ({ sku, name: v.name, units: v.units, revenue: round2(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Margin distribution (lifetime — based on product master, not order-scoped)
  const marginBuckets = [
    { label: '< 20%',   lo: -Infinity, hi: 20,  count: 0 },
    { label: '20–35%',  lo: 20,        hi: 35,  count: 0 },
    { label: '35–50%',  lo: 35,        hi: 50,  count: 0 },
    { label: '50–65%',  lo: 50,        hi: 65,  count: 0 },
    { label: '65%+',    lo: 65,        hi: Infinity, count: 0 },
  ];
  let unknownMargin = 0;
  for (const p of productsRows) {
    const retail = Number(p.retail_price);
    const cost = p.wholesale_cost == null ? null : Number(p.wholesale_cost);
    if (retail <= 0 || cost == null) {
      unknownMargin += 1;
      continue;
    }
    const m = ((retail - cost) / retail) * 100;
    const b = marginBuckets.find((x) => m >= x.lo && m < x.hi);
    if (b) b.count += 1;
  }
  // Append unknown bucket at end for transparency
  const marginBucketsOut: MarginSlice[] = [
    ...marginBuckets.map(({ label, count }) => ({ label, count })),
    { label: 'unknown', count: unknownMargin },
  ];

  // Never-ordered products (lifetime)
  const sold = new Set<string>();
  for (const r of orderItems) sold.add(r.product_sku);
  const neverOrdered = productsRows
    .filter((p) => !sold.has(p.sku))
    .slice(0, 25)
    .map((p) => ({ sku: p.sku, name: p.name }));

  // Brand performance (in window)
  const skuToBrand = new Map<string, string>();
  for (const p of productsRows) skuToBrand.set(p.sku, p.brands?.name ?? '(Unbranded)');
  const brandMap = new Map<string, { revenue: number; units: number }>();
  for (const r of orderItems) {
    const brand = skuToBrand.get(r.product_sku) ?? '(Unbranded)';
    const prev = brandMap.get(brand) ?? { revenue: 0, units: 0 };
    prev.revenue += Number(r.line_subtotal ?? 0);
    prev.units += r.quantity;
    brandMap.set(brand, prev);
  }
  const brandPerformance = Array.from(brandMap.entries())
    .map(([brand, v]) => ({ brand, revenue: round2(v.revenue), units: v.units }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12);

  return {
    headline: {
      activeCount: activeRes.count ?? 0,
      inactiveCount: inactiveRes.count ?? 0,
      outOfStockCount: oosRes.count ?? 0,
      lowStockCount: lowRes.count ?? 0,
    },
    topSellers,
    marginBuckets: marginBucketsOut,
    neverOrdered,
    brandPerformance,
  };
}
