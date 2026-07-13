import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * TEMPORARY diagnostic route — DELETE after the upc read-path investigation.
 * Reports exactly what this deployment's runtime sees when running the
 * admin edit page's product query. Admin-gated like every other admin route.
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const expected = await expectedSessionToken();
  if (!expected || cookie !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = createAdminClient();
  const id = req.nextUrl.searchParams.get('id') ?? '5d567ebb-1ea9-4b4b-a37c-647a83a50460';

  const COMPOSITE =
    'id, sku, slug, name, description, meta_description, weight_lb, upc, retail_price, is_active, is_featured, brand_id, primary_category_id, brands(name, slug), primary_category:categories!primary_category_id(name, slug), product_images(id, url, is_primary, display_order)';

  // 1) minimal select (novel URL)
  const minimal = await admin.from('products').select('id, upc').eq('id', id).maybeSingle();

  // 2) the exact composite select from the edit page (byte-identical URL)
  const composite = await admin.from('products').select(COMPOSITE).eq('id', id).maybeSingle();

  // 3) same composite through a client whose fetch forces cache:'no-store'
  const { createClient: createRaw } = await import('@supabase/supabase-js');
  const noStore = createRaw(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: (u: RequestInfo | URL, o?: RequestInit) => fetch(u, { ...o, cache: 'no-store' }) },
    },
  );
  const compositeNoStore = await noStore.from('products').select(COMPOSITE).eq('id', id).maybeSingle();

  // 4) composite with a whitespace variation → semantically identical, novel URL
  const compositeVariant = await admin
    .from('products')
    .select(COMPOSITE.replace('id, sku', 'id,  sku'))
    .eq('id', id)
    .maybeSingle();

  // 3) runtime env fingerprint (no secrets — host + key FORMAT only)
  let host = '(unset)';
  try { host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host; } catch {}
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const keyFormat = key.startsWith('sb_secret_')
    ? 'sb_secret (new)'
    : key.startsWith('eyJ')
      ? 'legacy JWT'
      : key.length === 0
        ? '(unset)'
        : `unknown len=${key.length}`;

  return NextResponse.json({
    ok: true,
    supabaseHost: host,
    serviceKeyFormat: keyFormat,
    minimal: {
      error: minimal.error?.message ?? null,
      hasRow: !!minimal.data,
      hasUpcKey: minimal.data ? Object.prototype.hasOwnProperty.call(minimal.data, 'upc') : null,
      upc: minimal.data?.upc ?? null,
    },
    composite: {
      error: composite.error?.message ?? null,
      hasRow: !!composite.data,
      rowKeys: composite.data ? Object.keys(composite.data) : null,
      upc: (composite.data as { upc?: string | null } | null)?.upc ?? null,
    },
    compositeNoStore: {
      error: compositeNoStore.error?.message ?? null,
      upc: (compositeNoStore.data as { upc?: string | null } | null)?.upc ?? null,
    },
    compositeVariant: {
      error: compositeVariant.error?.message ?? null,
      upc: (compositeVariant.data as { upc?: string | null } | null)?.upc ?? null,
    },
  });
}
