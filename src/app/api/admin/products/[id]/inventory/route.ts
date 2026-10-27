import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyPreview } from '@/lib/preview-mode';
import { isPackProductId } from '@/lib/product-packs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: { id: string } };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, errorMessage: string) => json({ ok: false, errorMessage }, status);
const adjustment = z.object({
  action: z.enum(['start', 'add', 'remove']), quantity: z.number().int().min(0).max(1000000),
  reason: z.string().trim().min(3).max(500), requestId: z.string().uuid(),
}).strict().refine(value => value.action === 'start' || value.quantity > 0, 'Enter a positive quantity.');
const fulfillment = z.object({ vendorId: z.string().uuid(), weightLb: z.number().finite().positive().max(9999.99) }).strict();

async function access(req: NextRequest, id: string, write = false) {
  const token = await expectedSessionToken();
  if (!token || req.cookies.get(ADMIN_COOKIE)?.value !== token) return fail(401, 'Not authenticated.');
  if (!isPackProductId(id)) return fail(400, 'Invalid product ID.');
  if (write && req.headers.get('origin') !== req.nextUrl.origin) return fail(403, 'Invalid request origin.');
  if (write && isReadOnlyPreview()) return fail(409, 'Inventory changes are disabled in preview.');
  return null;
}

async function readBody(req: NextRequest): Promise<unknown> {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('Send inventory details as JSON.');
  if (Number(req.headers.get('content-length') || 0) > 4096) throw new Error('Request is too large.');
  const reader = req.body?.getReader();
  if (!reader) throw new Error('Send inventory details as JSON.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); throw new Error('Request is too large.'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function storageError(error: { code?: string; message?: string }) {
  if (error.code === 'P0002') return fail(404, 'Product not found.');
  if (['P0001', '22023', '23505', '23514'].includes(error.code || '')) {
    return fail(409, error.message?.startsWith('Inventory: ') ? error.message.slice(11) : 'Inventory changed or the adjustment is invalid. Refresh and try again.');
  }
  if (['42P01', '42703', 'PGRST202', 'PGRST205'].includes(error.code || '')) return fail(503, 'Inventory setup is not available yet.');
  return fail(500, 'Could not save inventory. Refresh before retrying.');
}

export async function GET(req: NextRequest, { params }: Context) {
  const denied = await access(req, params.id);
  if (denied) return denied;
  const admin = createAdminClient();
  const [product, inventory, movements, vendors] = await Promise.all([
    admin.from('products').select('id,sku,name,stock_status,weight_lb,preferred_vendor_id,units_per_pack,pack_unit_label,pack_size').eq('id', params.id).is('deleted_at', null).maybeSingle(),
    admin.from('product_inventory').select('product_id,on_hand,reserved,low_stock_threshold,updated_at').eq('product_id', params.id).maybeSingle(),
    admin.from('inventory_movements').select('id,action,quantity,on_hand_after,reserved_after,reason,created_at,order_id').eq('product_id', params.id).order('created_at', { ascending: false }).limit(30),
    admin.from('vendors').select('id,name,is_self_fulfilled').eq('is_active', true).is('deleted_at', null).order('name'),
  ]);
  const error = product.error || inventory.error || movements.error || vendors.error;
  if (error) return storageError(error);
  if (!product.data) return fail(404, 'Product not found.');
  return json({ ok: true, product: product.data, inventory: inventory.data, movements: movements.data || [], vendors: vendors.data || [] });
}

export async function POST(req: NextRequest, { params }: Context) {
  const denied = await access(req, params.id, true);
  if (denied) return denied;
  let input: z.infer<typeof adjustment>;
  try { input = adjustment.parse(await readBody(req)); }
  catch { return fail(400, 'Enter a whole quantity, a reason of 3–500 characters, and a valid request ID.'); }
  const { data, error } = await createAdminClient().rpc('inventory_adjust', {
    p_product_id: params.id, p_action: input.action, p_quantity: input.quantity,
    p_reason: input.reason, p_request_id: input.requestId,
  });
  if (error) return storageError(error);
  return json({ ok: true, inventory: data });
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const denied = await access(req, params.id, true);
  if (denied) return denied;
  let input: z.infer<typeof fulfillment>;
  try { input = fulfillment.parse(await readBody(req)); }
  catch { return fail(400, 'Choose a fulfillment vendor and enter the packaged shipping weight in pounds.'); }
  const admin = createAdminClient();
  const vendor = await admin.from('vendors').select('id').eq('id', input.vendorId).eq('is_active', true).is('deleted_at', null).maybeSingle();
  if (vendor.error) return storageError(vendor.error);
  if (!vendor.data) return fail(400, 'Choose an active fulfillment vendor.');
  const result = await admin.from('products').update({ preferred_vendor_id: input.vendorId, weight_lb: input.weightLb })
    .eq('id', params.id).is('deleted_at', null).select('id').maybeSingle();
  if (result.error) return storageError(result.error);
  if (!result.data) return fail(404, 'Product not found.');
  return json({ ok: true });
}
