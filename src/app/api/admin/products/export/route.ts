import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { toCsv, csvFilename } from '@/lib/admin/csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get('lcg_admin')?.value;
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || cookie !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const search = req.nextUrl.searchParams.get('q') ?? '';
  const admin = createAdminClient();

  let q = admin
    .from('products')
    .select(
      'sku, name, retail_price, wholesale_cost, is_active, is_featured, stock_status, pack_size, weight_lb, short_description, brands(name), primary_category:categories!primary_category_id(name)',
    );
  if (search) q = q.or(`sku.ilike.%${search}%,name.ilike.%${search}%`);
  q = q.order('name', { ascending: true }).limit(5000);

  const { data, error } = await q;
  if (error) {
    console.error('[admin/products/export]', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  type Row = {
    sku: string;
    name: string;
    retail_price: number | string;
    wholesale_cost: number | string | null;
    is_active: boolean;
    is_featured: boolean;
    stock_status: string;
    pack_size: string | null;
    weight_lb: number | string | null;
    short_description: string | null;
    brands: { name: string } | null;
    primary_category: { name: string } | null;
  };

  const rows = ((data ?? []) as unknown as Row[]).map((p) => ({
    sku: p.sku,
    name: p.name,
    brand: p.brands?.name ?? '',
    category: p.primary_category?.name ?? '',
    retail_price: Number(p.retail_price).toFixed(2),
    wholesale_cost: p.wholesale_cost !== null ? Number(p.wholesale_cost).toFixed(2) : '',
    margin_pct:
      p.wholesale_cost !== null && Number(p.retail_price) > 0
        ? Math.round(((Number(p.retail_price) - Number(p.wholesale_cost)) / Number(p.retail_price)) * 100)
        : '',
    is_active: p.is_active,
    is_featured: p.is_featured,
    stock_status: p.stock_status,
    pack_size: p.pack_size ?? '',
    weight_lb: p.weight_lb ?? '',
    short_description: p.short_description ?? '',
  }));

  const columns = [
    'sku', 'name', 'brand', 'category', 'retail_price', 'wholesale_cost',
    'margin_pct', 'is_active', 'is_featured', 'stock_status', 'pack_size',
    'weight_lb', 'short_description',
  ];
  const body = toCsv(rows, columns);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${csvFilename('products')}"`,
      'cache-control': 'no-store',
    },
  });
}
