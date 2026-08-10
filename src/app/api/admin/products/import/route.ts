import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseCsv } from '@/lib/admin/csv';
import { validGtin } from '@/lib/seo/product-schema';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/products/import/  (multipart form-data: file, mode)
 *
 * Bulk product UPDATE from an edited copy of the full-field export.
 * Update-only: rows match existing products by sku; unknown SKUs are row
 * errors, never creations. Two-phase: mode=preview computes the full
 * changeset and errors without writing; mode=apply re-validates from
 * scratch and writes only when the file is completely clean
 * (all-or-nothing — one bad row blocks the import, by design).
 *
 * Cell semantics: empty = no change; the literal token CLEAR empties a
 * nullable field. brand/category are matched by exact name — no
 * auto-creation. slug/id/image_urls/timestamps are ignored even if
 * edited: slug changes would break the live Google feed, sitemap, and
 * indexed URLs (route the rare intentional rename through the product
 * edit form, which handles uniqueness).
 *
 * Writes are per-product batched updates with full validation up front,
 * so the only way to stop mid-way is an infrastructure error; if that
 * happens the response reports exactly how many rows had been applied.
 * (True transactions would need a Postgres function; not worth the
 * migration for an admin tool with pre-validated input.)
 */

const CLEAR = 'CLEAR';
const STOCK_STATUSES = new Set(['in_stock', 'low_stock', 'out_of_stock', 'discontinued']);

// Import column → DB column. Aliases accept the vocabulary people
// actually type. Columns absent from this map are ignored (reported).
const HEADER_ALIASES: Record<string, string> = {
  sku: 'sku',
  name: 'name',
  brand: 'brand',
  category: 'category',
  retail_price: 'retail_price',
  wholesale_cost: 'wholesale_cost',
  wholesale_price: 'wholesale_cost',
  description: 'description',
  short_description: 'short_description',
  pack_size: 'pack_size',
  units_per_pack: 'units_per_pack',
  weight_lb: 'weight_lb',
  upc: 'upc',
  meta_description: 'meta_description',
  stock_status: 'stock_status',
  is_active: 'is_active',
  visible: 'is_active',
  is_featured: 'is_featured',
  featured: 'is_featured',
};

// Deliberately never importable.
const IGNORED_COLUMNS = new Set(['slug', 'id', 'image_urls', 'created_at', 'updated_at', 'margin_pct']);

type DbProduct = {
  id: string;
  sku: string;
  name: string;
  retail_price: number | string;
  wholesale_cost: number | string | null;
  description: string | null;
  short_description: string | null;
  pack_size: string | null;
  units_per_pack: number | null;
  weight_lb: number | string | null;
  upc: string | null;
  meta_description: string | null;
  stock_status: string;
  is_active: boolean;
  is_featured: boolean;
  brand_id: string | null;
  primary_category_id: string | null;
};

type RowError = { line: number; sku: string; message: string };

type PlannedChange = {
  productId: string;
  sku: string;
  line: number;
  update: Record<string, unknown>;
  categoryChangedTo: string | null; // category id when primary category changes
};

function centsOf(v: number | string | null): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function parseMoney(cell: string): number | null {
  const n = Number(cell);
  if (!Number.isFinite(n) || n < 0) return null;
  if (Math.round(n * 100) / 100 !== n) return null;
  return n;
}

function parseBool(cell: string): boolean | null {
  const v = cell.trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const expected = await expectedSessionToken();
  if (!expected || cookie !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid form payload' }, { status: 400 });
  }

  const mode = String(form.get('mode') ?? 'preview');
  if (mode !== 'preview' && mode !== 'apply') {
    return NextResponse.json({ error: "mode must be 'preview' or 'apply'" }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'no CSV file provided' }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'file too large (20 MB max)' }, { status: 400 });
  }

  const grid = parseCsv(await file.text());
  if (grid.length < 2) {
    return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 });
  }

  // ── Header mapping ─────────────────────────────────────────────────
  const headers = grid[0].map((h) => h.trim().toLowerCase());
  const colIndex = new Map<string, number>(); // db column → csv index
  const ignoredColumns: string[] = [];
  headers.forEach((h, i) => {
    const mapped = HEADER_ALIASES[h];
    if (mapped) {
      if (!colIndex.has(mapped)) colIndex.set(mapped, i);
    } else {
      ignoredColumns.push(h);
    }
  });
  if (!colIndex.has('sku')) {
    return NextResponse.json({ error: "CSV must have a 'sku' column" }, { status: 400 });
  }
  const ignoredNoted = ignoredColumns.filter((c) => IGNORED_COLUMNS.has(c));
  const ignoredUnknown = ignoredColumns.filter((c) => !IGNORED_COLUMNS.has(c));

  // ── Load current state ─────────────────────────────────────────────
  const admin = createAdminClient();
  const [{ data: productsRaw, error: prodErr }, { data: brandsRaw }, { data: catsRaw }] =
    await Promise.all([
      admin
        .from('products')
        .select(
          'id, sku, name, retail_price, wholesale_cost, description, short_description, pack_size, units_per_pack, weight_lb, upc, meta_description, stock_status, is_active, is_featured, brand_id, primary_category_id',
        )
        .limit(5000),
      admin.from('brands').select('id, name'),
      admin.from('categories').select('id, name'),
    ]);
  if (prodErr) {
    console.error('[products/import] products fetch', prodErr);
    return NextResponse.json({ error: 'could not load products' }, { status: 500 });
  }

  const bySku = new Map<string, DbProduct>();
  for (const p of (productsRaw ?? []) as DbProduct[]) bySku.set(p.sku, p);

  const nameMap = (rows: Array<{ id: string; name: string }> | null) => {
    const map = new Map<string, string | 'AMBIGUOUS'>();
    for (const r of rows ?? []) {
      const key = r.name.trim();
      map.set(key, map.has(key) ? 'AMBIGUOUS' : r.id);
    }
    return map;
  };
  const brandByName = nameMap(brandsRaw as Array<{ id: string; name: string }> | null);
  const categoryByName = nameMap(catsRaw as Array<{ id: string; name: string }> | null);

  // ── Per-row validation + diff ──────────────────────────────────────
  const errors: RowError[] = [];
  const planned: PlannedChange[] = [];
  const fieldCounts: Record<string, number> = {};
  const seenSkus = new Set<string>();
  let unchanged = 0;

  const cellAt = (row: string[], col: string): string | undefined => {
    const i = colIndex.get(col);
    if (i === undefined) return undefined;
    return row[i] ?? '';
  };

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    const line = r + 1; // header is line 1
    const sku = (cellAt(row, 'sku') ?? '').trim();

    if (!sku) {
      errors.push({ line, sku: '', message: 'missing sku' });
      continue;
    }
    if (seenSkus.has(sku)) {
      errors.push({ line, sku, message: 'duplicate sku in file (earlier row wins — remove one)' });
      continue;
    }
    seenSkus.add(sku);

    const current = bySku.get(sku);
    if (!current) {
      errors.push({ line, sku, message: 'unknown sku — import never creates products' });
      continue;
    }

    const update: Record<string, unknown> = {};
    let categoryChangedTo: string | null = null;
    const rowErr = (message: string) => errors.push({ line, sku, message });

    for (const [col] of colIndex) {
      const raw = cellAt(row, col);
      if (raw === undefined) continue;
      const trimmed = raw.trim();
      if (col === 'sku' || trimmed === '') continue; // empty = no change

      const isClear = trimmed === CLEAR;

      switch (col) {
        case 'name': {
          if (isClear) { rowErr('name cannot be CLEARed'); break; }
          const v = trimmed;
          if (v.length < 2 || v.length > 200) { rowErr('name must be 2–200 characters'); break; }
          if (v !== current.name) update.name = v;
          break;
        }
        case 'brand': {
          if (isClear) { rowErr('brand cannot be CLEARed via import'); break; }
          const id = brandByName.get(trimmed);
          if (!id) { rowErr(`unknown brand "${trimmed}" — must match an existing brand name exactly`); break; }
          if (id === 'AMBIGUOUS') { rowErr(`brand name "${trimmed}" matches multiple brands`); break; }
          if (id !== current.brand_id) update.brand_id = id;
          break;
        }
        case 'category': {
          if (isClear) { rowErr('category cannot be CLEARed via import'); break; }
          const id = categoryByName.get(trimmed);
          if (!id) { rowErr(`unknown category "${trimmed}" — must match an existing category name exactly`); break; }
          if (id === 'AMBIGUOUS') { rowErr(`category name "${trimmed}" matches multiple categories`); break; }
          if (id !== current.primary_category_id) {
            update.primary_category_id = id;
            categoryChangedTo = id;
          }
          break;
        }
        case 'retail_price': {
          if (isClear) { rowErr('retail_price cannot be CLEARed'); break; }
          const v = parseMoney(trimmed);
          if (v === null) { rowErr('retail_price must be a number ≥ 0 with at most 2 decimals'); break; }
          if (centsOf(v) !== centsOf(current.retail_price)) update.retail_price = v;
          break;
        }
        case 'wholesale_cost': {
          if (isClear) {
            if (current.wholesale_cost !== null) update.wholesale_cost = null;
            break;
          }
          const v = parseMoney(trimmed);
          if (v === null) { rowErr('wholesale_cost must be a number ≥ 0 with at most 2 decimals, or CLEAR'); break; }
          if (centsOf(v) !== centsOf(current.wholesale_cost)) update.wholesale_cost = v;
          break;
        }
        case 'description':
        case 'short_description':
        case 'meta_description':
        case 'pack_size': {
          const max = col === 'description' ? 5000 : 2000;
          if (isClear) {
            if (current[col] !== null) update[col] = null;
            break;
          }
          if (raw.length > max) { rowErr(`${col} exceeds ${max} characters`); break; }
          // Spreadsheet apps rewrite CRLF↔LF inside cells on every save;
          // compare (and store) newline-normalised so a resaved-but-
          // unedited file doesn't show hundreds of phantom text changes.
          const norm = (s: string) => s.replace(/\r\n?/g, '\n');
          const v = norm(col === 'description' ? raw : trimmed);
          if (v !== norm(current[col] ?? '')) update[col] = v;
          break;
        }
        case 'units_per_pack': {
          if (isClear) {
            if (current.units_per_pack !== null) update.units_per_pack = null;
            break;
          }
          const v = Number(trimmed);
          if (!Number.isInteger(v) || v < 0) { rowErr('units_per_pack must be a whole number ≥ 0, or CLEAR'); break; }
          if (v !== current.units_per_pack) update.units_per_pack = v;
          break;
        }
        case 'weight_lb': {
          if (isClear) {
            if (current.weight_lb !== null) update.weight_lb = null;
            break;
          }
          const v = Number(trimmed);
          if (!Number.isFinite(v) || v < 0) { rowErr('weight_lb must be a number ≥ 0, or CLEAR'); break; }
          if (centsOf(v) !== centsOf(current.weight_lb)) update.weight_lb = v;
          break;
        }
        case 'upc': {
          if (isClear) {
            if (current.upc !== null) update.upc = null;
            break;
          }
          // Unedited cells round-trip untouched even when the stored UPC
          // is malformed (15 legacy rows are) — only an actual EDIT gets
          // validated, so one bad legacy UPC can't block a whole import.
          if (trimmed === (current.upc ?? '')) break;
          const digits = validGtin(trimmed);
          if (!digits || digits.length !== 12) {
            rowErr(`upc "${trimmed}" is not a valid 12-digit UPC (check-digit verified) — fix or CLEAR it`);
            break;
          }
          if (digits !== (current.upc ?? '')) update.upc = digits;
          break;
        }
        case 'stock_status': {
          if (isClear) { rowErr('stock_status cannot be CLEARed'); break; }
          const v = trimmed.toLowerCase();
          if (!STOCK_STATUSES.has(v)) {
            rowErr(`stock_status must be one of: ${[...STOCK_STATUSES].join(', ')}`);
            break;
          }
          if (v !== current.stock_status) update.stock_status = v;
          break;
        }
        case 'is_active':
        case 'is_featured': {
          if (isClear) { rowErr(`${col} cannot be CLEARed`); break; }
          const v = parseBool(trimmed);
          if (v === null) { rowErr(`${col} must be true or false`); break; }
          if (v !== current[col]) update[col] = v;
          break;
        }
      }
    }

    const changedCols = Object.keys(update);
    if (changedCols.length === 0) {
      unchanged++;
      continue;
    }
    for (const c of changedCols) fieldCounts[c] = (fieldCounts[c] ?? 0) + 1;
    planned.push({ productId: current.id, sku, line, update, categoryChangedTo });
  }

  const summary = {
    mode,
    total_rows: grid.length - 1,
    matched: seenSkus.size - errors.filter((e) => e.message.startsWith('unknown sku')).length,
    rows_with_changes: planned.length,
    unchanged,
    field_counts: fieldCounts,
    ignored_columns: ignoredNoted,
    unknown_columns: ignoredUnknown,
    errors,
    note: 'slug, id, image_urls and timestamps are never imported; empty cells mean no change; CLEAR empties a nullable field.',
  };

  if (mode === 'preview') {
    return NextResponse.json({ ok: errors.length === 0, ...summary });
  }

  // ── Apply (all-or-nothing gate) ────────────────────────────────────
  if (errors.length > 0) {
    return NextResponse.json(
      { ok: false, ...summary, error: 'file has row errors — nothing was written' },
      { status: 400 },
    );
  }
  if (planned.length === 0) {
    return NextResponse.json({ ok: true, ...summary, applied: 0 });
  }

  let applied = 0;
  for (const change of planned) {
    const { error: updErr } = await admin
      .from('products')
      .update(change.update)
      .eq('id', change.productId);
    if (updErr) {
      console.error('[products/import] update failed', change.sku, updErr);
      return NextResponse.json(
        {
          ok: false,
          ...summary,
          error: `write failed at ${change.sku} (line ${change.line}): ${updErr.message}. ${applied} of ${planned.length} rows were already applied; re-run preview to see remaining diffs.`,
          applied,
        },
        { status: 500 },
      );
    }
    // Mirror the edit form: product_categories M2M follows the primary
    // category (single-category model).
    if (change.categoryChangedTo) {
      await admin.from('product_categories').delete().eq('product_id', change.productId);
      await admin
        .from('product_categories')
        .insert({ product_id: change.productId, category_id: change.categoryChangedTo });
    }
    applied++;
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null;
  await admin.from('audit_log').insert({
    entity_type: 'product',
    action: 'bulk_import',
    actor_type: 'admin',
    ip_address: ip,
    metadata: {
      filename: file.name,
      total_rows: grid.length - 1,
      rows_changed: applied,
      unchanged,
      field_counts: fieldCounts,
    },
  });

  return NextResponse.json({ ok: true, ...summary, applied });
}
