import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';
import { shippingWriteError } from '@/lib/admin/shipping-access';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  BoxTemplateInputError,
  boxTemplateFromRow,
  parseBoxTemplateInput,
  parseBoxTemplateVersion,
} from '@/lib/shipping/box-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const columns = 'id,name,length_in,width_in,height_in,updated_at';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
class BodyTooLargeError extends Error {}

async function readBody(req: NextRequest): Promise<unknown> {
  if (Number(req.headers.get('content-length') || 0) > 4096) throw new BodyTooLargeError();
  const reader = req.body?.getReader();
  if (!reader) throw new BoxTemplateInputError('Send box template details as a JSON object.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BoxTemplateInputError('Send box template details as a JSON object.');
  }
}

function storageError(error: { code?: string }) {
  if (error.code === '23505') return json({ error: 'A saved box already uses that name. Choose another name.' }, 409);
  if (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code || '')) {
    return json({ error: 'Saved boxes are not available yet. Ask support to finish their setup.' }, 503);
  }
  return json({ error: 'Saved boxes could not be updated. Refresh and try again.' }, 500);
}

function requestError(error: unknown) {
  if (error instanceof BodyTooLargeError) return json({ error: 'Request too large.' }, 413);
  if (error instanceof BoxTemplateInputError) return json({ error: error.message }, 400);
  return json({ error: 'Saved boxes are temporarily unavailable. Please try again.' }, 500);
}

export async function GET(req: NextRequest) {
  try {
    const expected = await expectedSessionToken();
    if (!expected || req.cookies.get(ADMIN_COOKIE)?.value !== expected) return json({ error: 'Not authenticated.' }, 401);
    const { data, error } = await createAdminClient()
      .from('shipping_box_templates')
      .select(columns)
      .order('name', { ascending: true })
      .order('id', { ascending: true });
    if (error) return storageError(error);
    return json({ templates: (data || []).map(boxTemplateFromRow) });
  } catch (error) {
    return requestError(error);
  }
}

async function write(req: NextRequest, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    const denied = await shippingWriteError(req);
    if (denied) {
      denied.headers.set('Cache-Control', 'no-store');
      return denied;
    }
    const body = await readBody(req);
    const version = method === 'POST' ? null : parseBoxTemplateVersion(body);
    const input = method === 'DELETE' ? null : parseBoxTemplateInput(body);
    const db = createAdminClient();
    if (method === 'DELETE') {
      const { data, error } = await db.from('shipping_box_templates').delete()
        .eq('id', version!.id).eq('updated_at', version!.updatedAt).select('id').maybeSingle();
      if (error) return storageError(error);
      if (!data) return json({ error: 'This saved box changed or was deleted. Refresh saved boxes before trying again.' }, 409);
      return json({ deleted: true });
    }
    const values = { name: input!.name, length_in: input!.lengthIn, width_in: input!.widthIn, height_in: input!.heightIn };
    const query = method === 'POST'
      ? db.from('shipping_box_templates').insert(values)
      : db.from('shipping_box_templates').update(values).eq('id', version!.id).eq('updated_at', version!.updatedAt);
    const { data, error } = await query.select(columns).maybeSingle();
    if (error) return storageError(error);
    if (!data) return json({ error: 'This saved box changed or was deleted. Refresh saved boxes before trying again.' }, 409);
    return json({ template: boxTemplateFromRow(data) }, method === 'POST' ? 201 : 200);
  } catch (error) {
    return requestError(error);
  }
}

export function POST(req: NextRequest) { return write(req, 'POST'); }
export function PATCH(req: NextRequest) { return write(req, 'PATCH'); }
export function DELETE(req: NextRequest) { return write(req, 'DELETE'); }
