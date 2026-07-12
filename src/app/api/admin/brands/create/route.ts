import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';
import { slugify } from '@/lib/admin/slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/brands/create  (form-data → redirect)
 *
 * Server-form submit → redirect to the new brand's edit page, or back to
 * the new form with ?error= on failure. Self-checks the admin cookie
 * (`/api/admin/*` isn't covered by the middleware admin gate).
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
  const primaryVendorId = String(fd.get('primary_vendor_id') ?? '').trim() || null;

  if (!name) {
    return NextResponse.redirect(new URL('/admin/brands/new/?error=name', url.origin), 303);
  }

  const admin = createAdminClient();

  // Slug from name, disambiguated on collision (brands.slug is UNIQUE).
  const base = slugify(name) || 'brand';
  let slug = base;
  for (let i = 1; i < 50; i++) {
    const { data: clash } = await admin.from('brands').select('id').eq('slug', slug).maybeSingle();
    if (!clash) break;
    slug = `${base}-${i + 1}`;
  }

  const { data, error } = await admin
    .from('brands')
    .insert({
      name,
      slug,
      description,
      primary_vendor_id: primaryVendorId,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[brands/create] insert failed', error);
    // brands.name is UNIQUE too — a duplicate name trips 23505.
    const code = error?.code === '23505' ? 'exists' : 'save';
    return NextResponse.redirect(new URL(`/admin/brands/new/?error=${code}`, url.origin), 303);
  }

  return NextResponse.redirect(new URL(`/admin/brands/${data.id}/`, url.origin), 303);
}
