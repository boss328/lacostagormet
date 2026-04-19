import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const fd = await req.formData();
  const name = String(fd.get('name') ?? '').trim();
  const contact_email = String(fd.get('contact_email') ?? '').trim() || null;
  const contact_name = String(fd.get('contact_name') ?? '').trim() || null;
  const phone = String(fd.get('phone') ?? '').trim() || null;
  const terms = String(fd.get('terms') ?? '').trim() || null;
  const notes = String(fd.get('notes') ?? '').trim() || null;

  if (!name) {
    return NextResponse.redirect(new URL('/admin/vendors/new?error=name', url.origin), 303);
  }

  const admin = createAdminClient();
  // Disambiguate slug if collision
  let slug = slugify(name);
  for (let i = 1; i < 50; i++) {
    const { data: collision } = await admin.from('vendors').select('id').eq('slug', slug).maybeSingle();
    if (!collision) break;
    slug = `${slugify(name)}-${i + 1}`;
  }

  const { data, error } = await admin
    .from('vendors')
    .insert({
      name,
      slug,
      contact_email,
      contact_name,
      phone,
      terms,
      notes,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[vendors/create] insert failed', error);
    return NextResponse.redirect(new URL('/admin/vendors/new?error=save', url.origin), 303);
  }

  return NextResponse.redirect(new URL(`/admin/vendors/${data.id}`, url.origin), 303);
}
