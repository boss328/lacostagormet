import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/auth-helpers';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';
import { bcImage } from '@/lib/bcImage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/[orderNumber]/reorder
 *
 * Builds a "reorder candidate" payload from a past order: every original
 * line item is matched against the live products table by SKU, and the
 * shipping address is reshaped into the camelCase AddressPayload the
 * checkout form already accepts.
 *
 * Auth — accepts EITHER:
 *   1. Signed-in customer whose Supabase session email matches the
 *      order's customer_email (mirrors the customer order detail page).
 *   2. Admin: the lcg_admin cookie value matches sha256(password+password)
 *      OR the legacy plaintext fallback. Admin-initiated reorder loads
 *      items into the admin's own session cart (staff-assisted reorder
 *      pattern, per the brief).
 *
 * Failure modes are graceful — the historical SKU mismatch issue
 * (~82% of legacy BC orders carry vendor SKUs that don't exist in the
 * current products table) means many reorders return mostly
 * `unavailable_items`. The response is the same shape regardless;
 * caller decides whether to proceed.
 */

type OrderItemRow = {
  product_sku: string;
  product_name: string;
  quantity: number;
  unit_price: number | string;
};

type ProductImage = {
  url: string;
  is_primary: boolean;
  display_order: number;
};

type ProductLookup = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  pack_size: string | null;
  retail_price: number | string;
  is_active: boolean;
  deleted_at: string | null;
  stock_status: string;
  brands: { name: string } | null;
  product_images: ProductImage[] | null;
};

type ShipAddrJson = {
  first_name?: string;
  last_name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
};

function pickPrimaryUrl(images: ProductImage[] | null): string | null {
  if (!images || images.length === 0) return null;
  const p =
    images.find((i) => i.is_primary) ??
    [...images].sort((a, b) => a.display_order - b.display_order)[0];
  return p?.url ?? null;
}

async function isAdminCookie(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!cookie) return false;
  const expected = await expectedSessionToken();
  return Boolean(expected) && cookie === expected;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { orderNumber: string } },
) {
  const orderNumber = params.orderNumber;
  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, order_number, customer_email, shipping_address')
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (orderErr || !order) {
    return NextResponse.json({ errorMessage: 'Order not found' }, { status: 404 });
  }

  // Auth gate — admin OR matching customer.
  const adminAuthed = await isAdminCookie(req);
  let allowed = adminAuthed;
  if (!allowed) {
    const user = await getSessionUser();
    const sessionEmail = user?.email?.toLowerCase().trim() ?? '';
    const orderEmail = (order.customer_email ?? '').toLowerCase().trim();
    allowed = Boolean(sessionEmail) && sessionEmail === orderEmail;
  }
  if (!allowed) {
    return NextResponse.json({ errorMessage: 'Not authorised' }, { status: 403 });
  }

  // Pull line items
  const { data: itemsData, error: itemsErr } = await admin
    .from('order_items')
    .select('product_sku, product_name, quantity, unit_price')
    .eq('order_id', order.id);
  if (itemsErr) {
    return NextResponse.json(
      { errorMessage: 'Could not load original items' },
      { status: 500 },
    );
  }
  const items = (itemsData ?? []) as OrderItemRow[];

  if (items.length === 0) {
    return NextResponse.json({
      reorderable_items: [],
      unavailable_items: [],
      shipping_address: shapeShippingAddress(order.shipping_address as ShipAddrJson | null),
      source_order_number: order.order_number,
    });
  }

  // Look every SKU up in the live products table. Single round trip.
  const skus = Array.from(new Set(items.map((i) => i.product_sku).filter(Boolean)));
  const { data: productsData } = await admin
    .from('products')
    .select(
      'id, sku, slug, name, pack_size, retail_price, is_active, deleted_at, stock_status, brands(name), product_images(url, is_primary, display_order)',
    )
    .in('sku', skus);
  const products = (productsData ?? []) as unknown as ProductLookup[];
  const bySku = new Map(products.map((p) => [p.sku, p]));

  const reorderable: Array<{
    product_id: string;
    sku: string;
    name: string;
    slug: string;
    brand_name: string | null;
    pack_size: string | null;
    image_url: string | null;
    quantity: number;
    current_price: number;
    original_price: number;
  }> = [];
  const unavailable: Array<{ sku: string; name: string; reason: string }> = [];

  for (const item of items) {
    const p = bySku.get(item.product_sku);
    if (!p) {
      unavailable.push({
        sku: item.product_sku,
        name: item.product_name,
        reason: 'no_longer_carried',
      });
      continue;
    }
    if (!p.is_active || p.deleted_at !== null) {
      unavailable.push({
        sku: item.product_sku,
        name: item.product_name,
        reason: 'inactive',
      });
      continue;
    }
    if (p.stock_status === 'out_of_stock') {
      unavailable.push({
        sku: item.product_sku,
        name: item.product_name,
        reason: 'out_of_stock',
      });
      continue;
    }
    const url = pickPrimaryUrl(p.product_images);
    reorderable.push({
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      brand_name: p.brands?.name ?? null,
      pack_size: p.pack_size,
      image_url: url ? bcImage(url, 'mid') : null,
      quantity: item.quantity,
      current_price: Number(p.retail_price),
      original_price: Number(item.unit_price),
    });
  }

  return NextResponse.json({
    reorderable_items: reorderable,
    unavailable_items: unavailable,
    shipping_address: shapeShippingAddress(order.shipping_address as ShipAddrJson | null),
    source_order_number: order.order_number,
  });
}

function shapeShippingAddress(raw: ShipAddrJson | null) {
  // The orders table stores addresses as snake_case. AddressPayload (the
  // checkout form's contract) is camelCase. Reshape here so the cart
  // store + form both speak the same language.
  if (!raw) return null;
  return {
    firstName: raw.first_name ?? '',
    lastName:  raw.last_name  ?? '',
    address1:  raw.address1   ?? '',
    address2:  raw.address2   ?? '',
    city:      raw.city       ?? '',
    state:     raw.state      ?? 'CA',
    zip:       raw.zip        ?? '',
    phone:     raw.phone      ?? '',
  };
}
