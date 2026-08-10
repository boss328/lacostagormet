import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { toCsv, csvFilename } from '@/lib/admin/csv';
import { sortProductImages } from '@/lib/seo/product-schema';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Full-field product export. Every editable field plus read-only context
 * columns (id, image_urls, timestamps) at the end. The column set is the
 * contract for the bulk import at /api/admin/products/import/ — an
 * unedited export re-imported must produce zero changes and zero errors.
 * Keep headers stable snake_case; the import matches columns by name.
 */

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const expected = await expectedSessionToken();
  if (!expected || cookie !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const search = req.nextUrl.searchParams.get('q') ?? '';
  const admin = createAdminClient();

  let q = admin
    .from('products')
    .select(
      'id, sku, name, retail_price, wholesale_cost, description, short_description, pack_size, units_per_pack, weight_lb, slug, upc, meta_description, stock_status, is_active, is_featured, created_at, updated_at, brands(name), primary_category:categories!primary_category_id(name), product_images(url, is_primary, display_order)',
    );
  if (search) q = q.or(`sku.ilike.%${search}%,name.ilike.%${search}%`);
  q = q.order('name', { ascending: true }).limit(5000);

  const { data, error } = await q;
  if (error) {
    console.error('[admin/products/export]', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  type Row = {
    id: string;
    sku: string;
    name: string;
    retail_price: number | string;
    wholesale_cost: number | string | null;
    description: string | null;
    short_description: string | null;
    pack_size: string | null;
    units_per_pack: number | null;
    weight_lb: number | string | null;
    slug: string;
    upc: string | null;
    meta_description: string | null;
    stock_status: string;
    is_active: boolean;
    is_featured: boolean;
    created_at: string;
    updated_at: string;
    brands: { name: string } | null;
    primary_category: { name: string } | null;
    product_images: Array<{ url: string; is_primary: boolean; display_order: number }> | null;
  };

  const rows = ((data ?? []) as unknown as Row[]).map((p) => ({
    sku: p.sku,
    name: p.name,
    brand: p.brands?.name ?? '',
    category: p.primary_category?.name ?? '',
    retail_price: Number(p.retail_price).toFixed(2),
    wholesale_cost: p.wholesale_cost !== null ? Number(p.wholesale_cost).toFixed(2) : '',
    description: p.description ?? '',
    short_description: p.short_description ?? '',
    pack_size: p.pack_size ?? '',
    units_per_pack: p.units_per_pack ?? '',
    weight_lb: p.weight_lb ?? '',
    slug: p.slug,
    upc: p.upc ?? '',
    meta_description: p.meta_description ?? '',
    stock_status: p.stock_status,
    is_active: p.is_active,
    is_featured: p.is_featured,
    id: p.id,
    image_urls: sortProductImages(p.product_images)
      .map((i) => i.url)
      .join('|'),
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));

  const columns = [
    // Editable via the bulk import (slug intentionally NOT importable):
    'sku', 'name', 'brand', 'category', 'retail_price', 'wholesale_cost',
    'description', 'short_description', 'pack_size', 'units_per_pack',
    'weight_lb', 'slug', 'upc', 'meta_description', 'stock_status',
    'is_active', 'is_featured',
    // Read-only context:
    'id', 'image_urls', 'created_at', 'updated_at',
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
