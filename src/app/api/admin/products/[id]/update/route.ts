import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';
import { slugify } from '@/lib/admin/slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/products/[id]/update/  (multipart form-data)
 *
 * Mirrors /api/admin/products/create/ but updates an existing row.
 * Differences:
 *   - SKU + slug uniqueness checks ignore the row being updated
 *     (otherwise saving an unchanged form would conflict with itself).
 *   - Image upload is OPTIONAL on edit; when no new file is attached
 *     the existing product_images row stays untouched.
 *   - Replacing an image inserts a new product_images row marked
 *     primary and demotes any prior primary to non-primary, instead
 *     of deleting the old row. Preserves order/email history that may
 *     reference the old URL.
 *   - product_categories M2M is rebuilt to match the new primary
 *     category (single-category model — admin can't multi-tag yet).
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

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const productId = params.id;

  // ── Auth re-check ──────────────────────────────────────────────────
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const expected = await expectedSessionToken();
  if (!expected) return fail(503, 'Server misconfigured (ADMIN_PASSWORD missing).');
  if (cookie !== expected) return fail(401, 'Not authenticated.');

  // ── Parse form ─────────────────────────────────────────────────────
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

  // ── Validate ───────────────────────────────────────────────────────
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
  if (slug.length < 2) fieldErrors.slug = 'Could not generate a URL slug.';

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

  const admin = createAdminClient();

  // ── Confirm product exists ─────────────────────────────────────────
  const { data: existing, error: existsErr } = await admin
    .from('products')
    .select('id, sku, slug')
    .eq('id', productId)
    .maybeSingle();
  if (existsErr) {
    console.error('[products/update] lookup failed', existsErr);
    return fail(500, 'Lookup failed.');
  }
  if (!existing) return fail(404, 'Product not found.');

  // ── SKU + slug uniqueness (excluding self) ─────────────────────────
  const [{ data: skuClash }, { data: slugClash }] = await Promise.all([
    sku !== existing.sku
      ? admin.from('products').select('id').eq('sku', sku).neq('id', productId).maybeSingle()
      : Promise.resolve({ data: null }),
    slug !== existing.slug
      ? admin.from('products').select('id').eq('slug', slug).neq('id', productId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (skuClash) return fail(400, 'SKU already exists.', { sku: 'SKU already exists.' });
  if (slugClash) return fail(400, 'URL slug already exists.', { slug: 'URL slug already exists.' });

  // ── Resolve FK IDs ─────────────────────────────────────────────────
  const [{ data: brand }, { data: category }] = await Promise.all([
    admin.from('brands').select('id').eq('slug', brandSlug).maybeSingle(),
    admin.from('categories').select('id').eq('slug', categorySlug).maybeSingle(),
  ]);

  if (!brand) return fail(400, 'Validation failed.', { brand_slug: 'Unknown brand.' });
  if (!category) return fail(400, 'Validation failed.', { category_slug: 'Unknown category.' });

  // ── Optional image upload ──────────────────────────────────────────
  let newImageUrl: string | null = null;
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
      console.error('[products/update] storage upload failed', upErr);
      const msg = upErr.message?.toLowerCase().includes('bucket')
        ? `Image upload failed — Supabase storage bucket "${STORAGE_BUCKET}" missing.`
        : `Image upload failed: ${upErr.message}`;
      return fail(500, msg, { image: msg });
    }

    const { data: pub } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(key);
    newImageUrl = pub?.publicUrl ?? null;
  }

  // ── UPDATE product row ─────────────────────────────────────────────
  const { data: updated, error: updErr } = await admin
    .from('products')
    .update({
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
    .eq('id', productId)
    .select('id, slug, name')
    .single();

  if (updErr || !updated) {
    console.error('[products/update] update failed', updErr);
    if (updErr?.code === '23505') {
      const detail = (updErr.message ?? '').toLowerCase();
      if (detail.includes('sku')) return fail(400, 'SKU already exists.', { sku: 'SKU already exists.' });
      if (detail.includes('slug')) return fail(400, 'URL slug already exists.', { slug: 'URL slug already exists.' });
    }
    return fail(500, updErr?.message ?? 'Update failed.');
  }

  // ── Refresh product_categories M2M to match the new primary cat ────
  await admin.from('product_categories').delete().eq('product_id', productId);
  await admin
    .from('product_categories')
    .insert({ product_id: productId, category_id: category.id });

  // ── Demote prior primary image + insert new primary if uploaded ────
  if (newImageUrl) {
    await admin
      .from('product_images')
      .update({ is_primary: false })
      .eq('product_id', productId);
    await admin.from('product_images').insert({
      product_id: productId,
      url: newImageUrl,
      alt_text: name,
      display_order: 0,
      is_primary: true,
    });
  }

  return NextResponse.json({
    ok: true,
    product: { id: updated.id, slug: updated.slug, name: updated.name },
  });
}
