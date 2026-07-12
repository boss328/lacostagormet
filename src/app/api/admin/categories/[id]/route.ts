import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';
import { slugify } from '@/lib/admin/slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH  /api/admin/categories/[id]  — update (form-data → JSON)
 * DELETE /api/admin/categories/[id]  — delete, or deactivate if still in use
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
  if (!name) return new NextResponse('Category name is required.', { status: 400 });

  const slugInput = String(fd.get('slug') ?? '').trim();
  const slug = (slugInput ? slugify(slugInput) : slugify(name)) || 'category';
  const description = String(fd.get('description') ?? '').trim() || null;
  const metaTitle = String(fd.get('meta_title') ?? '').trim() || null;
  const metaDescription = String(fd.get('meta_description') ?? '').trim() || null;

  const activeRaw = String(fd.get('is_active') ?? '');
  const isActive = activeRaw === 'true' || activeRaw === 'on';

  const displayOrderRaw = String(fd.get('display_order') ?? '').trim();
  const provided = Number(displayOrderRaw);
  const displayOrder = displayOrderRaw && Number.isFinite(provided) ? Math.trunc(provided) : 0;

  const admin = createAdminClient();
  const { error } = await admin
    .from('categories')
    .update({
      name,
      slug,
      description,
      display_order: displayOrder,
      is_active: isActive,
      meta_title: metaTitle,
      meta_description: metaDescription,
    })
    .eq('id', params.id);

  if (error) {
    if (error.code === '23505') {
      return new NextResponse('That URL slug is already taken by another category.', { status: 400 });
    }
    console.error('[categories/update] failed', error);
    return new NextResponse(error.message, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAdmin(req))) return new NextResponse('Not authenticated.', { status: 401 });

  const admin = createAdminClient();
  const id = params.id;

  // "In use" = any product points here as its primary category, or is tagged
  // into it via the M2M join. product_categories cascades on delete, so a
  // hard delete would silently drop those tags — deactivate instead.
  const [{ count: primaryCount }, { count: taggedCount }] = await Promise.all([
    admin.from('products').select('id', { count: 'exact', head: true }).eq('primary_category_id', id),
    admin
      .from('product_categories')
      .select('category_id', { count: 'exact', head: true })
      .eq('category_id', id),
  ]);

  if ((primaryCount ?? 0) > 0 || (taggedCount ?? 0) > 0) {
    const { error } = await admin.from('categories').update({ is_active: false }).eq('id', id);
    if (error) return new NextResponse(error.message, { status: 500 });
    return NextResponse.json({ ok: true, deactivated: true });
  }

  const { error } = await admin.from('categories').delete().eq('id', id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true, deleted: true });
}
