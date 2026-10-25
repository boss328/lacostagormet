import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';
import { isReadOnlyPreview } from '@/lib/preview-mode';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  isPackProductId, PackInputError, parsePackConfiguration, parsePackOptionInput,
  type PackOption, type PackOptionsResponse,
} from '@/lib/product-packs';
import { isStockStatus } from '@/lib/product-availability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: { id: string } };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, errorMessage: string) => json({ ok: false, errorMessage }, status);
const columns = 'id,sku,name,slug,description,retail_price,units_per_pack,pack_unit_label,weight_lb,stock_status,is_active,preferred_vendor_id,pack_parent_id,product_images(id,url,alt_text,product_id,is_primary,display_order)';
class BodyTooLargeError extends Error {}

async function access(req: NextRequest, id: string, write = false) {
  const expected = await expectedSessionToken();
  if (!expected || req.cookies.get(ADMIN_COOKIE)?.value !== expected) return fail(401, 'Not authenticated.');
  if (!isPackProductId(id)) return fail(400, 'Invalid product ID.');
  if (write && req.headers.get('origin') !== req.nextUrl.origin) return fail(403, 'Invalid request origin.');
  if (write && isReadOnlyPreview()) return fail(409, 'Product changes are disabled in preview.');
  return null;
}

async function readBody(req: NextRequest): Promise<unknown> {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new PackInputError('Send pack details as JSON.');
  if (Number(req.headers.get('content-length') || 0) > 16384) throw new BodyTooLargeError();
  const reader = req.body?.getReader();
  if (!reader) throw new PackInputError('Send pack details as JSON.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new PackInputError('Send valid JSON pack details.'); }
}

function storageError(error: { code?: string; message?: string }) {
  if (error.code === 'P0002') return fail(404, 'Product not found.');
  if (error.code === '23505') return fail(409, 'This SKU, URL slug, or pack count already exists. Choose a different one.');
  if (['22023', '23514', '22P02', '23503', '22003'].includes(error.code || '')) {
    return fail(400, 'Pack details could not be saved. Check the pack count, uploaded image, and fulfillment vendor. An existing group’s original count cannot change.');
  }
  if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code || '')) {
    return fail(503, 'Pack options are not available yet. Ask support to finish their setup.');
  }
  return fail(500, 'Pack options are temporarily unavailable. Please try again.');
}

function requestError(error: unknown) {
  if (error instanceof PackInputError) return fail(400, error.message);
  if (error instanceof BodyTooLargeError) return fail(413, 'Request too large.');
  return fail(500, 'Pack options are temporarily unavailable. Please try again.');
}

type ImageRow = { id: string; url: string; alt_text: string | null; product_id: string; is_primary: boolean; display_order: number };
type ProductRow = Omit<PackOption, 'primary_image_url' | 'vendor_id'> & {
  preferred_vendor_id: string | null;
  pack_parent_id: string | null;
  product_images: ImageRow[];
};

function option(row: ProductRow): PackOption {
  const images = [...(row.product_images || [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.display_order - b.display_order);
  return {
    id: row.id, sku: row.sku, name: row.name, slug: row.slug, description: row.description,
    retail_price: Number(row.retail_price), units_per_pack: row.units_per_pack,
    pack_unit_label: row.pack_unit_label, weight_lb: row.weight_lb == null ? null : Number(row.weight_lb),
    stock_status: isStockStatus(row.stock_status) ? row.stock_status : 'out_of_stock',
    is_active: row.is_active, vendor_id: row.preferred_vendor_id,
    primary_image_url: images[0]?.url || null,
  };
}

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const denied = await access(req, params.id);
    if (denied) return denied;
    const admin = createAdminClient();
    const source = await admin.from('products').select('id,pack_parent_id').eq('id', params.id).is('deleted_at', null).maybeSingle();
    if (source.error) return storageError(source.error);
    if (!source.data) return fail(404, 'Product not found.');
    const parentId = source.data.pack_parent_id || source.data.id;
    const [group, vendors] = await Promise.all([
      admin.from('products').select(columns).or(`id.eq.${parentId},pack_parent_id.eq.${parentId}`).is('deleted_at', null).order('units_per_pack', { ascending: true }),
      admin.from('vendors').select('id,name,is_self_fulfilled').eq('is_active', true).is('deleted_at', null).order('name'),
    ]);
    if (group.error) return storageError(group.error);
    if (vendors.error) return storageError(vendors.error);
    const rows = (group.data || []) as ProductRow[];
    if (!rows.some(row => row.id === parentId)) return fail(404, 'Original product not found.');
    const result: PackOptionsResponse = {
      ok: true, parentId, options: rows.map(option), vendors: vendors.data || [],
      images: rows.flatMap(row => (row.product_images || []).map(({ id, url, alt_text, product_id }) => ({ id, url, alt_text, product_id }))),
    };
    return json(result);
  } catch (error) { return requestError(error); }
}

export async function POST(req: NextRequest, { params }: Context) {
  try {
    const denied = await access(req, params.id, true);
    if (denied) return denied;
    const input = parsePackOptionInput(await readBody(req));
    const { data, error } = await createAdminClient().rpc('create_product_pack_option', { p_product_id: params.id, p_input: input });
    if (error) return storageError(error);
    if (!isPackProductId(data)) return fail(500, 'The pack option could not be confirmed. Refresh the product before retrying.');
    return json({ ok: true, product: { id: data, ...input } }, 201);
  } catch (error) { return requestError(error); }
}

export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const denied = await access(req, params.id, true);
    if (denied) return denied;
    const input = parsePackConfiguration(await readBody(req));
    const { data, error } = await createAdminClient().rpc('configure_product_pack', {
      p_product_id: params.id, p_units: input.units_per_pack, p_label: input.pack_unit_label,
    });
    if (error) return storageError(error);
    return json({ ok: true, parentId: data });
  } catch (error) { return requestError(error); }
}
