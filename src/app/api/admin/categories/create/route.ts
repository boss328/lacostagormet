import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';
import { slugify } from '@/lib/admin/slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/categories/create  (form-data → redirect)
 *
 * Mirrors /api/admin/vendors/create. Server-form submit: on success we
 * redirect to the new category's edit page; on failure we bounce back to
 * the new form with ?error=. `/api/admin/*` is NOT covered by the
 * middleware admin gate (that only matches `/admin/*`), so this route
 * re-checks the admin cookie itself.
 */

async function isAdmin(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const expected = await expectedSessionToken();
  return !!expected && cookie === expected;
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (!(await isAdmin(req))) {
    return NextResponse.redirect(new URL('/admin/login/', url.origin), 303);
  }

  const fd = await req.formData();
  const name = String(fd.get('name') ?? '').trim();
  const description = String(fd.get('description') ?? '').trim() || null;
  const displayOrderRaw = String(fd.get('display_order') ?? '').trim();

  if (!name) {
    return NextResponse.redirect(new URL('/admin/categories/new/?error=name', url.origin), 303);
  }

  const admin = createAdminClient();

  // Slug from name, disambiguated on collision (categories.slug is UNIQUE).
  const base = slugify(name) || 'category';
  let slug = base;
  for (let i = 1; i < 50; i++) {
    const { data: clash } = await admin
      .from('categories')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!clash) break;
    slug = `${base}-${i + 1}`;
  }

  // display_order: honour an explicit value, else append after the current max.
  let displayOrder: number;
  const provided = Number(displayOrderRaw);
  if (displayOrderRaw && Number.isFinite(provided)) {
    displayOrder = Math.trunc(provided);
  } else {
    const { data: maxRow } = await admin
      .from('categories')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    displayOrder = (maxRow?.display_order ?? 0) + 10;
  }

  const { data, error } = await admin
    .from('categories')
    .insert({ name, slug, description, display_order: displayOrder, is_active: true })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[categories/create] insert failed', error);
    return NextResponse.redirect(new URL('/admin/categories/new/?error=save', url.origin), 303);
  }

  return NextResponse.redirect(new URL(`/admin/categories/${data.id}/`, url.origin), 303);
}
