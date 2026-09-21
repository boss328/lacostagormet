import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { inferPackSize } from './lib/infer-pack-size';

// pnpm exec tsx scripts/backfill-pack-sizes.ts ENV_FILE --plan PLAN_FILE
// Review PLAN_FILE, then repeat with --apply PLAN_FILE. Credentials stay local.
type Change = {
  id: string;
  sku: string;
  name: string;
  before: string | null;
  after: string;
  evidence: string;
};
async function main() {
  const [env, mode, path] = process.argv.slice(2);
  assert.ok(
    env && path && ['--plan', '--apply'].includes(mode),
    'Expected ENV_FILE --plan|--apply PLAN_FILE',
  );
  process.loadEnvFile(env);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  if (mode === '--plan') {
    const products = [];
    for (let offset = 0; ; offset += 500) {
      const result = await db
        .from('products')
        .select('id,sku,name,description,pack_size')
        .eq('is_active', true)
        .order('id')
        .range(offset, offset + 499);
      assert.equal(result.error, null);
      products.push(...result.data!);
      if (result.data!.length < 500) break;
    }
    const changes: Change[] = [];
    for (const product of products.filter((p) => !p.pack_size?.trim())) {
      let after = inferPackSize(product.name);
      let evidence = product.name;
      // This title lost its size; the existing description explicitly states both.
      if (
        product.sku === 'SFSBZ' &&
        /48 oz bottle/i.test(product.description ?? '') &&
        /six bottles per case/i.test(product.description ?? '')
      ) {
        after = '6 × 48 oz';
        evidence = product.description!;
      }
      assert.ok(after, `Unresolved packaging: ${product.sku} ${product.name}`);
      changes.push({
        id: product.id,
        sku: product.sku,
        name: product.name,
        before: product.pack_size,
        after,
        evidence,
      });
    }
    // Exclusive creation preserves the original before-values for rollback.
    writeFileSync(path, JSON.stringify(changes, null, 2), { flag: 'wx' });
    console.log(
      `Planned ${changes.length} pack-size updates. No database changes.`,
    );
    return;
  }
  const changes: Change[] = JSON.parse(readFileSync(path, 'utf8'));
  let applied = 0;
  for (const change of changes) {
    assert.ok(change.after && !change.before?.trim());
    const current = await db
      .from('products')
      .select('name,pack_size')
      .eq('id', change.id)
      .eq('sku', change.sku)
      .single();
    assert.equal(current.error, null);
    if (current.data!.pack_size === change.after) continue; // Safe resume.
    assert.equal(
      current.data!.name,
      change.name,
      `Name changed for ${change.sku}; re-review first`,
    );
    assert.equal(
      current.data!.pack_size,
      change.before,
      `Pack size changed for ${change.sku}; preserving admin edit`,
    );
    let query = db
      .from('products')
      .update({ pack_size: change.after })
      .eq('id', change.id)
      .eq('name', change.name);
    query =
      change.before === null
        ? query.is('pack_size', null)
        : query.eq('pack_size', change.before);
    const result = await query.select('id,pack_size').single();
    assert.equal(result.error, null);
    assert.equal(result.data!.pack_size, change.after);
    applied++;
  }
  console.log(`Applied and verified ${applied} pack-size updates.`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
