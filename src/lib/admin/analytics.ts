import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Dashboard analytics queries. Keep each function narrow + parallelisable —
 * the dashboard loads them all with Promise.all so slow networks don't
 * compound.
 *
 * All money-shaped values round to 2 decimals before returning.
 */

export type RevenuePoint = { date: string; revenue: number; orders: number };
export type TopProduct = { sku: string; name: string; revenue: number; units: number };
export type LtvBucket = { label: string; min: number; max: number; count: number };
export type StockAlert = {
  id: string;
  sku: string;
  name: string;
  stock_status: string;
  retail_price: number | string;
};
export type BrandBreakdown = { brand: string; revenue: number; orders: number };
export type StateBreakdown = { state: string; revenue: number; orders: number };
export type CohortRow = { cohort: string; size: number; retention: number[] };
export type DashSummary = {
  todaysRevenue: number;
  revenueDelta: number;
  ordersLast24h: number;
  ordersDeltaPct: number;
  unfulfilledCount: number;
  customerCount: number;
  orderCount: number;
  lifetimeRevenue: number;
  aovLast30d: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function startOfDay(d: Date): string {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString();
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function monthKey(iso: string): string {
  // "2026-04-19T..." → "2026-04"
  return iso.slice(0, 7);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function loadDashSummary(): Promise<DashSummary> {
  const admin = createAdminClient();
  const today = startOfDay(new Date());
  const yesterday = startOfDay(daysAgo(1));
  const thirtyAgo = daysAgo(30).toISOString();
  const sixtyAgo = daysAgo(60).toISOString();

  const [todayRes, yestRes, unfRes, custRes, orderRes, ltRevRes, aovRes, prior24Res] =
    await Promise.all([
      admin.from('orders').select('total').eq('status', 'paid').gte('created_at', today),
      admin
        .from('orders')
        .select('total')
        .eq('status', 'paid')
        .gte('created_at', yesterday)
        .lt('created_at', today),
      admin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'paid')
        .not('fulfillment_status', 'in', '(shipped,delivered)'),
      admin.from('customers').select('id', { count: 'exact', head: true }),
      admin.from('orders').select('id', { count: 'exact', head: true }),
      admin.from('orders').select('total').in('status', ['paid', 'payment_held']),
      admin
        .from('orders')
        .select('total')
        .in('status', ['paid', 'payment_held'])
        .gte('created_at', thirtyAgo),
      admin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['paid', 'payment_held'])
        .gte('created_at', sixtyAgo)
        .lt('created_at', thirtyAgo),
    ]);

  const sum = (rows: Array<{ total: number | string }> | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);

  const todaysRevenue = round2(sum(todayRes.data));
  const yestRevenue = round2(sum(yestRes.data));
  const aov30 = aovRes.data
    ? (aovRes.data.length > 0
        ? round2(sum(aovRes.data) / aovRes.data.length)
        : 0)
    : 0;
  const ordersLast24h = (todayRes.data ?? []).length;
  const priorOrders = prior24Res.count ?? 0;
  const ordersDeltaPct =
    priorOrders === 0 ? 0 : round2(((ordersLast24h - priorOrders) / priorOrders) * 100);

  return {
    todaysRevenue,
    revenueDelta: round2(todaysRevenue - yestRevenue),
    ordersLast24h,
    ordersDeltaPct,
    unfulfilledCount: unfRes.count ?? 0,
    customerCount: custRes.count ?? 0,
    orderCount: orderRes.count ?? 0,
    lifetimeRevenue: round2(sum(ltRevRes.data)),
    aovLast30d: aov30,
  };
}

/** Daily revenue + order count for the last N days. */
export async function loadRevenueSeries(days = 90): Promise<RevenuePoint[]> {
  const admin = createAdminClient();
  const since = daysAgo(days).toISOString();
  // fetch in pages since orders table has 3141 rows; default cap is 1000.
  const all: Array<{ total: number | string; created_at: string }> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data } = await admin
      .from('orders')
      .select('total, created_at')
      .in('status', ['paid', 'payment_held'])
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    const rows = data ?? [];
    all.push(...(rows as Array<{ total: number | string; created_at: string }>));
    if (rows.length < pageSize) break;
  }

  const byDay = new Map<string, { revenue: number; orders: number }>();
  for (let i = days - 1; i >= 0; i--) {
    byDay.set(daysAgo(i).toISOString().slice(0, 10), { revenue: 0, orders: 0 });
  }
  for (const row of all) {
    const day = row.created_at.slice(0, 10);
    const bucket = byDay.get(day);
    if (!bucket) continue;
    bucket.revenue += Number(row.total ?? 0);
    bucket.orders += 1;
  }
  return Array.from(byDay.entries()).map(([date, v]) => ({
    date,
    revenue: round2(v.revenue),
    orders: v.orders,
  }));
}

/** Top products by revenue from order_items joined to products metadata. */
export async function loadTopProducts(limit = 20): Promise<TopProduct[]> {
  const admin = createAdminClient();
  // Pull from order_items — join order for status filter.
  const { data } = await admin
    .from('order_items')
    .select(
      'product_sku, product_name, quantity, line_subtotal, orders!inner(status)',
    )
    .eq('orders.status', 'paid')
    .limit(20000);

  const map = new Map<string, { name: string; revenue: number; units: number }>();
  for (const row of (data ?? []) as Array<{
    product_sku: string;
    product_name: string;
    quantity: number;
    line_subtotal: number | string;
  }>) {
    const key = row.product_sku;
    const prev = map.get(key) ?? { name: row.product_name, revenue: 0, units: 0 };
    prev.revenue += Number(row.line_subtotal ?? 0);
    prev.units += row.quantity;
    map.set(key, prev);
  }
  const all = Array.from(map.entries())
    .map(([sku, v]) => ({
      sku,
      name: v.name,
      revenue: round2(v.revenue),
      units: v.units,
    }))
    .sort((a, b) => b.revenue - a.revenue);
  return all.slice(0, limit);
}

/** Customer LTV buckets — only considers paid orders with a customer_id OR email. */
export async function loadLtvBuckets(): Promise<LtvBucket[]> {
  const admin = createAdminClient();
  const all: Array<{ customer_email: string; total: number | string }> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data } = await admin
      .from('orders')
      .select('customer_email, total')
      .in('status', ['paid', 'payment_held'])
      .range(from, from + pageSize - 1);
    const rows = data ?? [];
    all.push(...(rows as Array<{ customer_email: string; total: number | string }>));
    if (rows.length < pageSize) break;
  }

  const ltv = new Map<string, number>();
  for (const row of all) {
    const email = (row.customer_email ?? '').toLowerCase();
    if (!email) continue;
    ltv.set(email, (ltv.get(email) ?? 0) + Number(row.total ?? 0));
  }

  const buckets: LtvBucket[] = [
    { label: '$0–100',       min: 0,    max: 100,    count: 0 },
    { label: '$100–500',     min: 100,  max: 500,    count: 0 },
    { label: '$500–1k',      min: 500,  max: 1000,   count: 0 },
    { label: '$1k–5k',       min: 1000, max: 5000,   count: 0 },
    { label: '$5k+',         min: 5000, max: Infinity, count: 0 },
  ];
  ltv.forEach((amount) => {
    const b = buckets.find((x) => amount >= x.min && amount < x.max);
    if (b) b.count += 1;
  });
  return buckets;
}

/** Low / out-of-stock alerts. No inventory column yet — we surface the
 *  stock_status flag only. Phase 7 adds numeric stock tracking. */
export async function loadStockAlerts(): Promise<StockAlert[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('products')
    .select('id, sku, name, stock_status, retail_price')
    .in('stock_status', ['out_of_stock', 'low_stock'])
    .order('stock_status', { ascending: false })
    .limit(30);
  return (data ?? []) as StockAlert[];
}

/** Revenue by brand (treemap). */
export async function loadBrandBreakdown(): Promise<BrandBreakdown[]> {
  const admin = createAdminClient();
  // Join order_items → products → brands. Filter to paid orders.
  const { data } = await admin
    .from('order_items')
    .select(
      'line_subtotal, products!inner(brand_id, brands(name)), orders!inner(status)',
    )
    .eq('orders.status', 'paid')
    .limit(20000);

  type Row = {
    line_subtotal: number | string;
    products: { brand_id: string | null; brands: { name: string } | null } | null;
  };

  const map = new Map<string, { revenue: number; orders: number }>();
  for (const row of (data ?? []) as unknown as Row[]) {
    const brand = row.products?.brands?.name ?? '(Unbranded)';
    const prev = map.get(brand) ?? { revenue: 0, orders: 0 };
    prev.revenue += Number(row.line_subtotal ?? 0);
    prev.orders += 1;
    map.set(brand, prev);
  }
  return Array.from(map.entries())
    .map(([brand, v]) => ({ brand, revenue: round2(v.revenue), orders: v.orders }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Revenue and order count by US state from orders.shipping_address.state. */
export async function loadStateBreakdown(): Promise<StateBreakdown[]> {
  const admin = createAdminClient();
  const all: Array<{ total: number | string; shipping_address: { state?: string } | null }> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data } = await admin
      .from('orders')
      .select('total, shipping_address')
      .in('status', ['paid', 'payment_held'])
      .range(from, from + pageSize - 1);
    const rows = data ?? [];
    all.push(...(rows as unknown as typeof all));
    if (rows.length < pageSize) break;
  }
  const map = new Map<string, { revenue: number; orders: number }>();
  for (const row of all) {
    const state = (row.shipping_address?.state ?? '').toUpperCase();
    if (!state || state.length !== 2) continue;
    const prev = map.get(state) ?? { revenue: 0, orders: 0 };
    prev.revenue += Number(row.total ?? 0);
    prev.orders += 1;
    map.set(state, prev);
  }
  return Array.from(map.entries())
    .map(([state, v]) => ({ state, revenue: round2(v.revenue), orders: v.orders }))
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Cohort retention heatmap. Rows = first-purchase month for the last 12
 * months. Cells = % of that cohort who purchased in month N since.
 */
export async function loadCohortRetention(): Promise<CohortRow[]> {
  const admin = createAdminClient();
  const thirteenMonthsAgo = new Date();
  thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
  thirteenMonthsAgo.setDate(1);

  const all: Array<{ customer_email: string; created_at: string }> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data } = await admin
      .from('orders')
      .select('customer_email, created_at')
      .in('status', ['paid', 'payment_held'])
      .gte('created_at', thirteenMonthsAgo.toISOString())
      .range(from, from + pageSize - 1);
    const rows = data ?? [];
    all.push(...(rows as unknown as typeof all));
    if (rows.length < pageSize) break;
  }

  // email → first month + set of active months
  const firstMonth = new Map<string, string>();
  const activity = new Map<string, Set<string>>();
  for (const row of all) {
    const email = (row.customer_email ?? '').toLowerCase();
    if (!email) continue;
    const m = monthKey(row.created_at);
    if (!firstMonth.has(email) || m < firstMonth.get(email)!) firstMonth.set(email, m);
    const set = activity.get(email) ?? new Set<string>();
    set.add(m);
    activity.set(email, set);
  }

  // Build the last 12 cohort months, oldest first.
  const cohorts: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    cohorts.push(d.toISOString().slice(0, 7));
  }

  const cohortMembers = new Map<string, string[]>();
  firstMonth.forEach((m, email) => {
    if (cohorts.includes(m)) {
      const arr = cohortMembers.get(m) ?? [];
      arr.push(email);
      cohortMembers.set(m, arr);
    }
  });

  return cohorts.map((cohortMonth) => {
    const members = cohortMembers.get(cohortMonth) ?? [];
    const retention: number[] = [];
    for (let offset = 0; offset < 12; offset++) {
      const target = new Date(`${cohortMonth}-01T00:00:00Z`);
      target.setUTCMonth(target.getUTCMonth() + offset);
      const targetKey = target.toISOString().slice(0, 7);
      // Only include cells up through the current month.
      const now = new Date().toISOString().slice(0, 7);
      if (targetKey > now) {
        retention.push(-1); // sentinel
        continue;
      }
      if (members.length === 0) {
        retention.push(0);
        continue;
      }
      let active = 0;
      for (const email of members) {
        if (activity.get(email)?.has(targetKey)) active += 1;
      }
      retention.push(Math.round((active / members.length) * 100));
    }
    return {
      cohort: cohortMonth,
      size: members.length,
      retention,
    };
  });
}
