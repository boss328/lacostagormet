import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH  /api/admin/brands/[id]  — update (form-data → JSON)
 * DELETE /api/admin/brands/[id]  — delete, or deactivate if still in use
 *
 * Self-checks the admin cookie: `/api/admin/*` is not covered by the
 * middleware admin gate.
 */

async function isAdmin(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const expected = await expectedSessionToken();
  return !!expected && cookie === expected;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAdmin(req))) return new NextResponse('Not authenticated.', { status: 401 });

  const fd = await req.formData();
  const name = String(fd.get('name') ?? '').trim();
  if (!name) return new NextResponse('Brand name is required.', { status: 400 });

  // slug is intentionally NOT editable here — brand slugs are wired into
  // /brand/[slug] links. Rename the display name freely; the URL stays put.
  const description = String(fd.get('description') ?? '').trim() || null;
  const primaryVendorId = String(fd.get('primary_vendor_id') ?? '').trim() || null;

  const activeRaw = String(fd.get('is_active') ?? '');
  const isActive = activeRaw === 'true' || activeRaw === 'on';

  const admin = createAdminClient();
  const { error } = await admin
    .from('brands')
    .update({
      name,
      description,
      primary_vendor_id: primaryVendorId,
      is_active: isActive,
    })
    .eq('id', params.id);

  if (error) {
    if (error.code === '23505') {
      return new NextResponse('That brand name or URL slug is already taken.', { status: 400 });
    }
    console.error('[brands/update] failed', error);
    return new NextResponse(error.message, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAdmin(req))) return new NextResponse('Not authenticated.', { status: 401 });

  const admin = createAdminClient();
  const id = params.id;

  // "In use" = any product points here via brand_id (FK is NO ACTION, so a
  // hard delete would be blocked anyway) — deactivate instead of deleting.
  const { count } = await admin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', id);

  if ((count ?? 0) > 0) {
    const { error } = await admin.from('brands').update({ is_active: false }).eq('id', id);
    if (error) return new NextResponse(error.message, { status: 500 });
    return NextResponse.json({ ok: true, deactivated: true });
  }

  const { error } = await admin.from('brands').delete().eq('id', id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true, deleted: true });
}
