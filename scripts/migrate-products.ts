/**
 * Migrate BigCommerce products → Supabase.
 *
 * Source: lcg-spec/references/bigcommerce/products-export.csv (87 cols, 158 rows)
 * Target: products, product_images, product_categories
 *
 * Filters to Product Visible? = Y AND Allow Purchases? = Y (expected: 122 rows).
 *
 * Idempotent:
 *   - products      → UPSERT ON CONFLICT (sku)
 *   - product_images, product_categories → DELETE for this SKU set, then INSERT.
 *     CSV is authoritative for images + categories on every re-run.
 *
 * Run:
 *   pnpm tsx scripts/migrate-products.ts --dry-run   # preview, no writes
 *   pnpm tsx scripts/migrate-products.ts             # live
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Env loader (same pattern as scripts/test-supabase-connection.ts — admin.ts
// can't be imported from a Node script because of its `server-only` guard).
// ---------------------------------------------------------------------------

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  const envFile = readFileSync(envPath, "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

// ---------------------------------------------------------------------------
// Mapping tables
// ---------------------------------------------------------------------------

/** Normalized (lowercased, trimmed) BC Brand Name → canonical seeded brand name. */
const BRAND_ALIASES: Record<string, string> = {
  "david rio chai tea": "David Rio",
};

/** Lowercased BC category fragment → our category slug. */
const CATEGORY_ALIASES: Record<string, string> = {
  "frappe mixes":     "frappes",
  "frappes":          "frappes",
  "teas":             "teas-and-chai",
  "chai":             "teas-and-chai",
  "chai tea":         "teas-and-chai",
  "cocoa":            "cocoa",
  "hot cocoa":        "cocoa",
  "hot chocolate":    "cocoa",
  "syrups":           "syrups-and-sauces",
  "syrups & sauces":  "syrups-and-sauces",
  "oatmeal":          "oatmeal-and-grains",
  "oatmeal & grains": "oatmeal-and-grains",
  "grains":           "oatmeal-and-grains",
  "smoothies":        "smoothie-bases",
  "smoothie":         "smoothie-bases",
  "smoothie bases":   "smoothie-bases",
  "smoothie mixes":   "smoothie-bases",
  "gourmet sauces and syrups": "syrups-and-sauces",
};

/** True = this BC path is intentionally ignored (don't warn about it). */
function isSilentlySkippedCategoryPath(path: string): boolean {
  const p = path.toLowerCase().trim();
  if (p === "brand names" || p.startsWith("brand names/")) return true;
  if (p === "protein & supplements" || p.startsWith("protein & supplements/")) return true;
  return false;
}

/**
 * brand slug → preferred_vendor_id slug. Fallback is DEFAULT_VENDOR_SLUG.
 *
 * Big Train → Houston's is intentional. Jeff buys Big Train via Houston's distributor,
 * not direct from Kerry Foodservice. brand_id still points to the Big Train brand row;
 * preferred_vendor_id routes fulfillment emails to Houston's. Jeff can reassign in admin.
 */
const VENDOR_FOR_BRAND_SLUG: Record<string, string> = {
  "big-train":            "houstons",
  "mocafe":               "mocafe",
  "dr-smoothie":          "sunny-sky",
  "david-rio":            "david-rio",
  "upouria":              "ibev",
  "monin":                "monin",
  "davinci-gourmet":      "davinci-gourmet",
  "cafe-essentials":      "houstons",
  "oregon-chai":          "houstons",
  "mylk-labs":            "houstons",
  "sunny-sky-products":   "sunny-sky",
};
const DEFAULT_VENDOR_SLUG = "houstons";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function slugFromBcUrl(productUrl: string): string {
  return productUrl.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Extract a pack-size string from a product name.
 * Handles both "Four 3 lb Bags" (multi-pack) and "2 lb Can" (single unit).
 * Returns null if nothing matches.
 */
function extractPackSize(name: string): string | null {
  const m = name.match(
    /((?:(?:Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|\d+)\s+)?[\d.]+\s*(?:lb|oz|kg|g)\.?\s*(?:Bag|Can|Box|Bottle|Pouch|Jug|Carton|Pack|Canister|Container)s?)/i,
  );
  return m ? m[1].trim().replace(/\s+/g, " ") : null;
}

type CsvRow = Record<string, string>;

interface BrandRow { id: string; name: string; slug: string; }
interface CategoryRow { id: string; name: string; slug: string; }
interface VendorRow { id: string; name: string; slug: string; }

interface ProductUpsertRow {
  sku: string;
  name: string;
  slug: string;
  brand_id: string | null;
  primary_category_id: string | null;
  description: string | null;
  short_description: null;
  pack_size: string | null;
  retail_price: number;
  weight_lb: number | null;
  meta_title: string | null;
  meta_description: string | null;
  preferred_vendor_id: string | null;
  is_active: true;
}

interface ImageRow {
  sku: string;
  url: string;
  alt_text: string | null;
  display_order: number;
  is_primary: boolean;
}

interface CategoryLink {
  sku: string;
  category_slug: string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const IS_DRY_RUN = process.argv.includes("--dry-run");

  console.log(`Mode: ${IS_DRY_RUN ? "DRY RUN — no writes" : "LIVE — writing to database"}`);
  console.log(`Supabase: ${url}\n`);

  // --- Load reference tables (brands, categories, vendors) ------------------

  const { data: brandsData, error: brandsErr } = await supabase
    .from("brands").select("id, name, slug");
  if (brandsErr) throw new Error(`Load brands failed: ${brandsErr.message}`);

  const brandByLcName = new Map<string, BrandRow>();
  for (const b of (brandsData ?? []) as BrandRow[]) {
    brandByLcName.set(b.name.toLowerCase(), b);
  }

  const { data: categoriesData, error: catsErr } = await supabase
    .from("categories").select("id, name, slug");
  if (catsErr) throw new Error(`Load categories failed: ${catsErr.message}`);

  const categoryBySlug = new Map<string, CategoryRow>();
  for (const c of (categoriesData ?? []) as CategoryRow[]) {
    categoryBySlug.set(c.slug, c);
  }

  const { data: vendorsData, error: vendsErr } = await supabase
    .from("vendors").select("id, name, slug");
  if (vendsErr) throw new Error(`Load vendors failed: ${vendsErr.message}`);

  const vendorBySlug = new Map<string, VendorRow>();
  for (const v of (vendorsData ?? []) as VendorRow[]) {
    vendorBySlug.set(v.slug, v);
  }

  console.log(
    `Reference tables: ${brandByLcName.size} brands · ${categoryBySlug.size} categories · ${vendorBySlug.size} vendors`,
  );

  // --- Parse CSV -----------------------------------------------------------

  const csvPath = resolve(
    process.cwd(),
    "lcg-spec/references/bigcommerce/products-export.csv",
  );
  const raw = readFileSync(csvPath, "utf-8");
  const allRows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  }) as CsvRow[];
  console.log(`CSV rows parsed: ${allRows.length}`);

  const visibleRows = allRows.filter(
    (r) => r["Product Visible?"] === "Y" && r["Allow Purchases?"] === "Y",
  );
  console.log(
    `Filtered to visible + purchasable: ${visibleRows.length} (${allRows.length - visibleRows.length} skipped by filter)\n`,
  );

  // --- Build plan ---------------------------------------------------------

  const productsToUpsert: ProductUpsertRow[] = [];
  const images: ImageRow[] = [];
  const categoryLinks: CategoryLink[] = [];

  const createdBrands: { name: string; slug: string }[] = [];
  const rowsSkipped: { identifier: string; reason: string }[] = [];
  const productsWithNoCategory: string[] = [];
  const unknownCategoryFragments = new Map<string, number>();

  for (const row of visibleRows) {
    const sku = (row["Product Code/SKU"] ?? "").trim();
    const name = (row["Product Name"] ?? "").trim();

    if (!sku) {
      rowsSkipped.push({ identifier: name || "(no name)", reason: "Missing SKU" });
      continue;
    }
    if (!name) {
      rowsSkipped.push({ identifier: sku, reason: "Missing Product Name" });
      continue;
    }

    const slug = slugFromBcUrl(row["Product URL"] ?? "");
    if (!slug) {
      rowsSkipped.push({ identifier: sku, reason: "Missing/empty Product URL" });
      continue;
    }

    const retailPrice = parseFloat(row["Price"] ?? "");
    if (!isFinite(retailPrice)) {
      rowsSkipped.push({ identifier: sku, reason: `Unparseable Price "${row["Price"]}"` });
      continue;
    }

    // -- Brand resolve ----
    const rawBrand = (row["Brand Name"] ?? "").trim();
    let brandId: string | null = null;
    let brandSlug: string | null = null;

    if (rawBrand) {
      const lcRaw = rawBrand.toLowerCase();
      const aliasedName = BRAND_ALIASES[lcRaw] ?? rawBrand;
      const lookupKey = aliasedName.toLowerCase();
      const match = brandByLcName.get(lookupKey);

      if (match) {
        brandId = match.id;
        brandSlug = match.slug;
      } else {
        // New brand — insert (live) or plan (dry-run).
        const newSlug = slugify(rawBrand);
        if (!createdBrands.some((b) => b.slug === newSlug)) {
          createdBrands.push({ name: rawBrand, slug: newSlug });
        }
        brandSlug = newSlug;

        if (!IS_DRY_RUN) {
          const { data, error } = await supabase
            .from("brands")
            .insert({ name: rawBrand, slug: newSlug, is_active: true })
            .select("id, name, slug")
            .single();
          if (error) {
            throw new Error(`Failed to create brand "${rawBrand}": ${error.message}`);
          }
          const created = data as BrandRow;
          brandByLcName.set(created.name.toLowerCase(), created);
          brandId = created.id;
        } else {
          brandId = null; // placeholder — won't be written in dry-run.
        }
      }
    }

    // -- Category resolve ----
    const categoryRaw = (row["Category"] ?? "").trim();
    const matchedCategorySlugs = new Set<string>();
    if (categoryRaw) {
      const paths = categoryRaw.split(";").map((s) => s.trim()).filter(Boolean);
      for (const path of paths) {
        if (isSilentlySkippedCategoryPath(path)) continue;
        const segments = path.split("/").map((s) => s.trim()).filter(Boolean);
        let matched = false;
        for (const seg of segments) {
          const aliasedSlug = CATEGORY_ALIASES[seg.toLowerCase()];
          if (aliasedSlug) {
            matchedCategorySlugs.add(aliasedSlug);
            matched = true;
            break; // top-level only — don't also match deeper segments
          }
        }
        if (!matched) {
          const firstSeg = segments[0] ?? path;
          unknownCategoryFragments.set(
            firstSeg,
            (unknownCategoryFragments.get(firstSeg) ?? 0) + 1,
          );
        }
      }
    }
    const primaryCatSlug = [...matchedCategorySlugs][0];
    const primaryCategoryId = primaryCatSlug
      ? categoryBySlug.get(primaryCatSlug)?.id ?? null
      : null;
    if (!primaryCategoryId) productsWithNoCategory.push(sku);

    // -- Vendor resolve ----
    const vendorSlug = (brandSlug && VENDOR_FOR_BRAND_SLUG[brandSlug]) ?? DEFAULT_VENDOR_SLUG;
    const preferredVendorId = vendorBySlug.get(vendorSlug)?.id ?? null;

    // -- Misc fields ----
    const weightLb = parseFloat(row["Product Weight"] ?? "");

    const product: ProductUpsertRow = {
      sku,
      name,
      slug,
      brand_id: brandId,
      primary_category_id: primaryCategoryId,
      description: row["Product Description"] || null,
      short_description: null,
      pack_size: extractPackSize(name),
      retail_price: retailPrice,
      weight_lb: isFinite(weightLb) ? weightLb : null,
      meta_title: row["Page Title"] || null,
      meta_description: row["Meta Description"] || null,
      preferred_vendor_id: preferredVendorId,
      is_active: true,
    };
    productsToUpsert.push(product);

    // -- Images ----
    for (let i = 1; i <= 7; i++) {
      const imgPath = (row[`Product Image File - ${i}`] ?? "").trim();
      if (!imgPath) continue;
      images.push({
        sku,
        url: imgPath,
        alt_text: (row[`Product Image Description - ${i}`] || name) || null,
        display_order: i - 1,
        is_primary: i === 1,
      });
    }

    // -- Category links ----
    for (const catSlug of matchedCategorySlugs) {
      categoryLinks.push({ sku, category_slug: catSlug });
    }
  }

  // --- Write (or skip in dry-run) -----------------------------------------

  if (!IS_DRY_RUN) {
    console.log(`\nUpserting ${productsToUpsert.length} products...`);
    const { data: upserted, error: upsertErr } = await supabase
      .from("products")
      .upsert(productsToUpsert, { onConflict: "sku" })
      .select("id, sku");
    if (upsertErr) throw new Error(`Products upsert failed: ${upsertErr.message}`);

    const productIdBySku = new Map<string, string>();
    for (const p of (upserted ?? []) as { id: string; sku: string }[]) {
      productIdBySku.set(p.sku, p.id);
    }
    const productIds = [...productIdBySku.values()];

    // product_images: delete + insert
    console.log(`Deleting existing product_images for ${productIds.length} products...`);
    const { error: delImgErr } = await supabase
      .from("product_images")
      .delete()
      .in("product_id", productIds);
    if (delImgErr) throw new Error(`Delete product_images failed: ${delImgErr.message}`);

    const imageInsertRows = images
      .map((img) => ({
        product_id: productIdBySku.get(img.sku)!,
        url: img.url,
        alt_text: img.alt_text,
        display_order: img.display_order,
        is_primary: img.is_primary,
      }))
      .filter((r) => r.product_id);
    if (imageInsertRows.length > 0) {
      console.log(`Inserting ${imageInsertRows.length} product_images rows...`);
      const { error: insImgErr } = await supabase
        .from("product_images")
        .insert(imageInsertRows);
      if (insImgErr) throw new Error(`Insert product_images failed: ${insImgErr.message}`);
    }

    // product_categories: delete + insert
    console.log(`Deleting existing product_categories for ${productIds.length} products...`);
    const { error: delCatErr } = await supabase
      .from("product_categories")
      .delete()
      .in("product_id", productIds);
    if (delCatErr) throw new Error(`Delete product_categories failed: ${delCatErr.message}`);

    const catLinkRows = categoryLinks
      .map((link) => ({
        product_id: productIdBySku.get(link.sku)!,
        category_id: categoryBySlug.get(link.category_slug)?.id!,
      }))
      .filter((r) => r.product_id && r.category_id);
    if (catLinkRows.length > 0) {
      console.log(`Inserting ${catLinkRows.length} product_categories links...`);
      const { error: insCatErr } = await supabase
        .from("product_categories")
        .insert(catLinkRows);
      if (insCatErr) throw new Error(`Insert product_categories failed: ${insCatErr.message}`);
    }
  }

  // --- Summary ------------------------------------------------------------

  console.log("\n=============== SUMMARY ===============");
  console.log(`Mode                       : ${IS_DRY_RUN ? "DRY RUN — no writes" : "LIVE"}`);
  console.log(`CSV rows total             : ${allRows.length}`);
  console.log(`After visible+purchase     : ${visibleRows.length}`);
  console.log(`Products to upsert         : ${productsToUpsert.length}`);
  console.log(`Product images (all rows)  : ${images.length}`);
  console.log(`Category links             : ${categoryLinks.length}`);
  console.log(`Rows skipped               : ${rowsSkipped.length}`);
  for (const s of rowsSkipped) {
    console.log(`   - ${s.identifier}: ${s.reason}`);
  }

  console.log(`\nBrands created on-the-fly  : ${createdBrands.length}`);
  for (const b of createdBrands) {
    console.log(`   + ${b.name}  (slug: ${b.slug})`);
  }

  console.log(`\nProducts with no category  : ${productsWithNoCategory.length}`);
  if (productsWithNoCategory.length > 0) {
    console.log("   (SKUs listed below — Jeff reviews in /admin/products)");
    const show = productsWithNoCategory.slice(0, 30);
    for (const sku of show) console.log(`   - ${sku}`);
    if (productsWithNoCategory.length > show.length) {
      console.log(`   ... and ${productsWithNoCategory.length - show.length} more`);
    }
  }

  console.log(`\nUnknown category fragments : ${unknownCategoryFragments.size}`);
  if (unknownCategoryFragments.size > 0) {
    console.log("   (not in alias map, not in skip list — review if any are worth mapping)");
    [...unknownCategoryFragments.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([frag, n]) => console.log(`   ${n.toString().padStart(3)} × "${frag}"`));
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nFATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
