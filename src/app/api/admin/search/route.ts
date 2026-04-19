import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchResult = {
  id: string;
  group: 'order' | 'customer' | 'product';
  label: string;
  sublabel?: string;
  href: string;
  hint?: string;
};

/**
 * GET /api/admin/search?q=<query>
 *
 * Returns up to 5 results each from orders, customers, and products.
 * Gated by the admin cookie — middleware catches any /admin/* route;
 * this one is under /api/ which needs its own check. Middleware config
 * lives at src/middleware.ts; this endpoint relies on it.
 */
export async function GET(req: NextRequest) {
  // /api/admin/* is NOT in the middleware matcher — so enforce here.
  const cookie = req.cookies.get('lcg_admin')?.value;
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || cookie !== expected) {
    return NextResponse.json({ results: [] }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ results: [] });

  const admin = createAdminClient();
  const like = `%${q}%`;

  const [ordersRes, customersRes, productsRes] = await Promise.all([
    admin
      .from('orders')
      .select('order_number, status, total, customer_email, created_at')
      .or(`order_number.ilike.${like},customer_email.ilike.${like}`)
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('customers')
      .select('id, email, first_name, last_name')
      .or(`email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`)
      .limit(5),
    admin
      .from('products')
      .select('id, sku, name, retail_price')
      .or(`sku.ilike.${like},name.ilike.${like}`)
      .eq('is_active', true)
      .limit(5),
  ]);

  const results: SearchResult[] = [];

  for (const o of (ordersRes.data ?? []) as Array<{
    order_number: string;
    status: string;
    total: number | string;
    customer_email: string;
  }>) {
    results.push({
      id: `order-${o.order_number}`,
      group: 'order',
      label: o.order_number,
      sublabel: `${o.customer_email} · ${o.status} · $${Number(o.total).toFixed(2)}`,
      href: `/admin/orders/${o.order_number}`,
    });
  }

  for (const c of (customersRes.data ?? []) as Array<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  }>) {
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
    results.push({
      id: `customer-${c.id}`,
      group: 'customer',
      label: name || c.email,
      sublabel: name ? c.email : undefined,
      href: `/admin/customers/${c.id}`,
    });
  }

  for (const p of (productsRes.data ?? []) as Array<{
    id: string;
    sku: string;
    name: string;
    retail_price: number | string;
  }>) {
    results.push({
      id: `product-${p.id}`,
      group: 'product',
      label: p.name,
      sublabel: `${p.sku} · $${Number(p.retail_price).toFixed(2)}`,
      href: `/admin/products/${p.id}`,
    });
  }

  return NextResponse.json({ results });
}
