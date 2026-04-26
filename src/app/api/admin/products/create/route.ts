import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';
import { slugify } from '@/lib/admin/slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/products/create/  (multipart form-data)
 *
 * Fields (mostly mirroring NewProductForm):
 *   name, sku, retail_price, category_slug, brand_slug, description,
 *   slug, weight_lb, meta_description, is_active, is_featured, image
 *
 * Server-side responsibilities:
 *   1. Re-check the admin session cookie. Middleware already gates the
 *      surface, but the API route is a separate trust boundary.
 *   2. Validate input (mirrors the client validators with stricter
 *      length / SKU regex bounds).
 *   3. Upload the image to Supabase Storage bucket `product-images`
 *      if attached. Failure surfaces as fieldErrors.image; the rest
 *      of the form keeps its values on the client.
 *   4. Resolve brand_slug → brand.id and category_slug → category.id.
 *   5. INSERT into products. SKU + slug uniqueness handled by DB
 *      constraints; map error code 23505 → fieldErrors.{sku|slug}.
 *   6. INSERT into product_categories (M2M) and product_images.
 *   7. Return { ok: true, product: { id, slug, name } }.
 */

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const STORAGE_BUCKET = 'product-images';

type FieldErrors = Partial<{
  name: string;
  sku: string;
  retail_price: string;
  category_slug: string;
  brand_slug: string;
  description: string;
  slug: string;
  image: string;
  general: string;
}>;

function fail(status: number, errorMessage: string, fieldErrors?: FieldErrors) {
  return NextResponse.json(
    { ok: false, errorMessage, fieldErrors: fieldErrors ?? null },
    { status },
  );
}

export async function POST(req: NextRequest) {
  // ── Auth re-check (middleware already gates, this is defence in depth) ──
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const expected = await expectedSessionToken();
  if (!expected) return fail(503, 'Server misconfigured (ADMIN_PASSWORD missing).');
  if (cookie !== expected) return fail(401, 'Not authenticated.');

  // ── Parse form ────────────────────────────────────────────────────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'Invalid form payload.');
  }

  const name = String(form.get('name') ?? '').trim();
  const sku = String(form.get('sku') ?? '').trim();
  const retailPriceRaw = String(form.get('retail_price') ?? '').trim();
  const categorySlug = String(form.get('category_slug') ?? '').trim();
  const brandSlug = String(form.get('brand_slug') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const slugRaw = String(form.get('slug') ?? '').trim();
  const weightLbRaw = String(form.get('weight_lb') ?? '0').trim();
  const metaDescription = String(form.get('meta_description') ?? '').trim();
  const isActive = String(form.get('is_active') ?? 'true') === 'true';
  const isFeatured = String(form.get('is_featured') ?? 'false') === 'true';
  const imageEntry = form.get('image');
  const image = imageEntry instanceof File && imageEntry.size > 0 ? imageEntry : null;

  // ── Validate ─────────────────────────────────────────────────────────
  const fieldErrors: FieldErrors = {};
  if (name.length < 2 || name.length > 200) fieldErrors.name = 'Name must be 2–200 characters.';
  if (!/^[a-zA-Z0-9_-]{2,50}$/.test(sku))
    fieldErrors.sku = 'SKU must be 2–50 alphanumeric characters, dashes, or underscores.';

  const retailPrice = Number(retailPriceRaw);
  if (!Number.isFinite(retailPrice) || retailPrice <= 0) {
    fieldErrors.retail_price = 'Price must be a positive number.';
  } else if (Math.round(retailPrice * 100) / 100 !== retailPrice) {
    fieldErrors.retail_price = 'Price must have at most two decimal places.';
  }

  if (!categorySlug) fieldErrors.category_slug = 'Category is required.';
  if (!brandSlug) fieldErrors.brand_slug = 'Brand is required.';
  if (description.length < 10 || description.length > 5000)
    fieldErrors.description = 'Description must be 10–5,000 characters.';

  const slug = slugRaw || slugify(name);
  if (slug.length < 2) fieldErrors.slug = 'Could not generate a URL slug. Provide one in Advanced.';

  let weightLb = 0;
  if (weightLbRaw) {
    const w = Number(weightLbRaw);
    if (!Number.isFinite(w) || w < 0) {
      fieldErrors.general = 'Weight must be a non-negative number.';
    } else {
      weightLb = w;
    }
  }

  if (image) {
    if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
      fieldErrors.image = 'Image must be JPEG, PNG, or WebP.';
    } else if (image.size > MAX_IMAGE_BYTES) {
      fieldErrors.image = 'Image must be under 8 MB.';
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return fail(400, 'Validation failed.', fieldErrors);
  }

  // ── Resolve FK IDs ────────────────────────────────────────────────────
  const admin = createAdminClient();

  const [{ data: brand, error: brandErr }, { data: category, error: catErr }] = await Promise.all([
    admin.from('brands').select('id').eq('slug', brandSlug).maybeSingle(),
    admin.from('categories').select('id').eq('slug', categorySlug).maybeSingle(),
  ]);

  if (brandErr) {
    console.error('[products/create] brand lookup failed', brandErr);
    return fail(500, 'Brand lookup failed.');
  }
  if (!brand) return fail(400, 'Validation failed.', { brand_slug: 'Unknown brand.' });
  if (catErr) {
    console.error('[products/create] category lookup failed', catErr);
    return fail(500, 'Category lookup failed.');
  }
  if (!category) return fail(400, 'Validation failed.', { category_slug: 'Unknown category.' });

  // ── Upload image (if any) ─────────────────────────────────────────────
  let imageUrl: string | null = null;
  if (image) {
    const ext = image.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const safeExt = /^(jpg|jpeg|png|webp)$/.test(ext) ? ext : 'jpg';
    const key = `${slug}-${Date.now()}.${safeExt}`;

    const buffer = Buffer.from(await image.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(key, buffer, {
        contentType: image.type,
        cacheControl: '31536000',
        upsert: false,
      });

    if (upErr) {
      console.error('[products/create] storage upload failed', upErr);
      const msg = upErr.message?.toLowerCase().includes('bucket')
        ? `Image upload failed — Supabase storage bucket "${STORAGE_BUCKET}" missing. Create it in the Supabase dashboard with public read access.`
        : `Image upload failed: ${upErr.message}`;
      return fail(500, msg, { image: msg });
    }

    const { data: pub } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(key);
    imageUrl = pub?.publicUrl ?? null;
  }

  // ── INSERT product ────────────────────────────────────────────────────
  const { data: created, error: insErr } = await admin
    .from('products')
    .insert({
      sku,
      name,
      slug,
      brand_id: brand.id,
      primary_category_id: category.id,
      description,
      retail_price: retailPrice,
      weight_lb: weightLb,
      meta_description: metaDescription || null,
      is_active: isActive,
      is_featured: isFeatured,
    })
    .select('id, slug, name')
    .single();

  if (insErr || !created) {
    console.error('[products/create] insert failed', insErr);
    if (insErr?.code === '23505') {
      // unique_violation — figure out which constraint
      const detail = (insErr.message ?? '').toLowerCase();
      if (detail.includes('sku')) return fail(400, 'SKU already exists.', { sku: 'SKU already exists.' });
      if (detail.includes('slug')) return fail(400, 'URL slug already exists.', { slug: 'URL slug already exists.' });
    }
    return fail(500, insErr?.message ?? 'Insert failed.');
  }

  // ── M2M product_categories + product_images ──────────────────────────
  await admin
    .from('product_categories')
    .insert({ product_id: created.id, category_id: category.id });

  if (imageUrl) {
    await admin.from('product_images').insert({
      product_id: created.id,
      url: imageUrl,
      alt_text: name,
      display_order: 0,
      is_primary: true,
    });
  }

  return NextResponse.json({
    ok: true,
    product: { id: created.id, slug: created.slug, name: created.name },
  });
}
