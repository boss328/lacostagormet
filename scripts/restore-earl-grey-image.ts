import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';

// Official product photo linked from the manufacturer's wholesale product page:
// https://wholesale.twoleavestea.com/product/organic-earl-grey-tea
const source =
  'https://cdn.prod.website-files.com/6437117e0ed2ced6f90f707e/64d1305a4309c0bf7d71b917_Sachet_Earl%20Grey.webp';
async function main() {
  const [env, mode] = process.argv.slice(2);
  assert.ok(
    env && ['--check', '--apply'].includes(mode),
    'Expected ENV_FILE --check|--apply',
  );
  process.loadEnvFile(env);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const product = await db
    .from('products')
    .select('id,sku,slug,product_images(id,url)')
    .eq('sku', 'T03100')
    .single();
  assert.equal(product.error, null);
  assert.equal(
    product.data!.slug,
    'two-leaves-and-a-bud-tea-organic-earl-grey-100-count-tea-sackets',
  );
  if (product.data!.product_images.length) {
    console.log('Earl Grey already has an image; preserving it.');
    return;
  }
  const response = await fetch(source);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('content-type')?.startsWith('image/'));
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 1000 && bytes.length < 8 * 1024 * 1024);
  if (mode !== '--apply') {
    console.log(
      `Verified official Earl Grey image (${bytes.length} bytes). No database changes.`,
    );
    return;
  }
  const key = 'two-leaves-organic-earl-grey-manufacturer-20260921.webp';
  const upload = await db.storage
    .from('product-images')
    .upload(key, bytes, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    });
  // A previous attempt may have uploaded successfully before insertion failed.
  if (
    upload.error &&
    !['409', 'Duplicate'].includes(
      String((upload.error as { statusCode?: string }).statusCode),
    ) &&
    !/already exists/i.test(upload.error.message)
  )
    throw upload.error;
  const url = db.storage.from('product-images').getPublicUrl(key)
    .data.publicUrl;
  assert.equal((await fetch(url)).status, 200);
  const latest = await db
    .from('product_images')
    .select('id')
    .eq('product_id', product.data!.id);
  assert.equal(latest.error, null);
  assert.equal(
    latest.data!.length,
    0,
    'An admin added an image during this run; preserving it',
  );
  const insert = await db
    .from('product_images')
    .insert({
      product_id: product.data!.id,
      url,
      alt_text: 'Two Leaves and a Bud Organic Earl Grey tea sachet',
      is_primary: true,
      display_order: 0,
    })
    .select('id,url')
    .single();
  assert.equal(insert.error, null);
  console.log(
    JSON.stringify({
      productSku: 'T03100',
      imageId: insert.data!.id,
      url: insert.data!.url,
      source,
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
