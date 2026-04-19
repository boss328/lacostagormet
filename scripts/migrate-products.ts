/**
 * Migrate BigCommerce products → Supabase from the v3 export.
 *
 * Source: lcg-spec/references/bigcommerce/products-export-v3.csv
 *   Row-oriented: `Item` column is "Product" | "Image" | "Video". Image rows
 *   follow their parent Product row. Parent BC product ID is also embedded
 *   in the image URL (/products/<PID>/images/<IID>/…) as a secondary check.
 *
 * Target: products, product_images
 *   - products: UPSERT ON CONFLICT (sku). Brand/category/vendor FKs are
 *     OMITTED from the payload so existing mappings from the v2 migration
 *     are preserved (v3 CSV only has numeric "Brand ID" / "Categories" — no
 *     human-readable mapping we can resolve without the old data).
 *   - product_images: for each product in the CSV, DELETE all existing rows
 *     then INSERT the CSV's images. CSV is authoritative.
 *
 * Image URLs stored as canonical 1280.1280 variant (largest that BC CDN
 * reliably serves); render-time helper (src/lib/bcImage.ts) downsizes.
 *
 * Run:
 *   pnpm tsx scripts/migrate-products.ts --dry-run
 *   pnpm tsx scripts/migrate-products.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import { bcImage } from "../src/lib/bcImage";

// ---------------------------------------------------------------------------
// Env loader
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
// Helpers
// ---------------------------------------------------------------------------

function slugFromBcUrl(productUrl: string): string {
  return productUrl.replace(/^\/+/, "").replace(/\/+$/, "");
}

function extractPackSize(name: string): string | null {
  const m = name.match(
    /((?:(?:Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|\d+)\s+)?[\d.]+\s*(?:lb|oz|kg|g)\.?\s*(?:Bag|Can|Box|Bottle|Pouch|Jug|Carton|Pack|Canister|Container)s?)/i,
  );
  return m ? m[1].trim().replace(/\s+/g, " ") : null;
}

const URL_PID_RE = /\/products\/(\d+)\/images\/(\d+)\//;

type CsvRow = Record<string, string>;

interface ProductUpsertRow {
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  pack_size: string | null;
  retail_price: number;
  weight_lb: number | null;
  meta_title: string | null;
  meta_description: string | null;
  is_active: true;
}

interface ImageRow {
  sku: string;
  url: string;            // canonical 1000.1000
  alt_text: string | null;
  sort_order: number;     // raw CSV "Image Sort Order"
  is_thumbnail: boolean;  // raw CSV "Image is Thumbnail"
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

  // --- Parse CSV ----------------------------------------------------------

  const csvPath = resolve(
    process.cwd(),
    "lcg-spec/references/bigcommerce/products-export-v3.csv",
  );
  const raw = readFileSync(csvPath, "utf-8");
  const allRows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  }) as CsvRow[];
  console.log(`CSV rows parsed: ${allRows.length}`);

  // --- Walk: Product → Image(s) → Product → ... --------------------------

  const productsToUpsert: ProductUpsertRow[] = [];
  const imagesBySku = new Map<string, ImageRow[]>();
  const warnings: string[] = [];
  const rowsSkipped: { identifier: string; reason: string }[] = [];
  let productRowsSeen = 0;
  let productRowsKept = 0;
  let imageRowsSeen = 0;
  let imageRowsKept = 0;
  let imageRowsDiscardedNoCtx = 0;
  let videoRowsSeen = 0;

  let ctx: { sku: string; bcProductId: string } | null = null;

  for (const row of allRows) {
    const item = (row["Item"] ?? "").trim();

    if (item === "Product") {
      productRowsSeen++;
      const isVisible = (row["Is Visible"] ?? "").trim().toUpperCase() === "TRUE";
      if (!isVisible) {
        ctx = null;
        continue;
      }

      const sku = (row["SKU"] ?? "").trim();
      const name = (row["Name"] ?? "").trim();
      const bcProductId = (row["ID"] ?? "").trim();

      if (!sku) {
        rowsSkipped.push({ identifier: name || "(no name)", reason: "Missing SKU" });
        ctx = null;
        continue;
      }
      if (!name) {
        rowsSkipped.push({ identifier: sku, reason: "Missing Name" });
        ctx = null;
        continue;
      }

      const slug = slugFromBcUrl(row["Product URL"] ?? "");
      if (!slug) {
        rowsSkipped.push({ identifier: sku, reason: "Missing/empty Product URL" });
        ctx = null;
        continue;
      }

      const retailPrice = parseFloat(row["Price"] ?? "");
      if (!isFinite(retailPrice)) {
        rowsSkipped.push({ identifier: sku, reason: `Unparseable Price "${row["Price"]}"` });
        ctx = null;
        continue;
      }

      const weightLb = parseFloat(row["Weight"] ?? "");

      productsToUpsert.push({
        sku,
        name,
        slug,
        description: row["Description"] || null,
        pack_size: extractPackSize(name),
        retail_price: retailPrice,
        weight_lb: isFinite(weightLb) ? weightLb : null,
        meta_title: row["Page Title"] || null,
        meta_description: row["Meta Description"] || null,
        is_active: true,
      });

      ctx = { sku, bcProductId };
      productRowsKept++;
    } else if (item === "Image") {
      imageRowsSeen++;

      if (!ctx) {
        imageRowsDiscardedNoCtx++;
        continue;
      }

      const rawUrl = (row["Internal Image URL (Export)"] ?? "").trim();
      if (!rawUrl) {
        warnings.push(`Empty image URL under product ${ctx.sku}`);
        continue;
      }

      const urlMatch = rawUrl.match(URL_PID_RE);
      if (!urlMatch) {
        warnings.push(`Malformed image URL under ${ctx.sku}: ${rawUrl.slice(0, 80)}…`);
        continue;
      }
      if (urlMatch[1] !== ctx.bcProductId) {
        // Belt-and-suspenders sanity check; trust CSV row order, just flag.
        warnings.push(
          `URL PID ${urlMatch[1]} mismatches ctx ${ctx.bcProductId} (sku ${ctx.sku}) — trusting row order`,
        );
      }

      const canonicalUrl = bcImage(rawUrl, "hero");
      const sortRaw = parseInt((row["Image Sort Order"] ?? "0").trim(), 10);
      const isThumb = (row["Image is Thumbnail"] ?? "").trim().toUpperCase() === "TRUE";

      const list = imagesBySku.get(ctx.sku) ?? [];
      list.push({
        sku: ctx.sku,
        url: canonicalUrl,
        alt_text: (row["Image Description"] || "").trim() || null,
        sort_order: isFinite(sortRaw) ? sortRaw : 0,
        is_thumbnail: isThumb,
      });
      imagesBySku.set(ctx.sku, list);
      imageRowsKept++;
    } else if (item === "Video") {
      videoRowsSeen++;
    }
  }

  // --- Finalize image rows per product -----------------------------------
  //  - sort ascending by sort_order (deterministic display_order)
  //  - if >1 thumbnail flagged, keep the first (lowest sort), demote the rest
  //  - if 0 thumbnails flagged, promote first to primary
  //  - set display_order = 0-based index after sort

  const finalImageRows: {
    sku: string;
    url: string;
    alt_text: string | null;
    display_order: number;
    is_primary: boolean;
  }[] = [];
  const productsWithZeroImages: string[] = [];
  let duplicateThumbCount = 0;

  for (const p of productsToUpsert) {
    const imgs = imagesBySku.get(p.sku) ?? [];
    if (imgs.length === 0) {
      productsWithZeroImages.push(p.sku);
      continue;
    }
    const sorted = [...imgs].sort((a, b) => a.sort_order - b.sort_order);
    const thumbs = sorted.filter((i) => i.is_thumbnail);
    let primaryUrl: string;
    if (thumbs.length === 0) {
      primaryUrl = sorted[0].url;
    } else {
      primaryUrl = thumbs[0].url;
      if (thumbs.length > 1) duplicateThumbCount += thumbs.length - 1;
    }
    sorted.forEach((img, idx) => {
      finalImageRows.push({
        sku: img.sku,
        url: img.url,
        alt_text: img.alt_text ?? p.name,
        display_order: idx,
        is_primary: img.url === primaryUrl,
      });
    });
  }

  // --- Summary pre-write --------------------------------------------------

  console.log(`Product rows seen          : ${productRowsSeen}`);
  console.log(`  kept (Is Visible=TRUE)   : ${productRowsKept}`);
  console.log(`Image rows seen            : ${imageRowsSeen}`);
  console.log(`  kept (under visible)     : ${imageRowsKept}`);
  console.log(`  discarded (no ctx)       : ${imageRowsDiscardedNoCtx}`);
  console.log(`Video rows seen            : ${videoRowsSeen}`);
  console.log(`Products to upsert         : ${productsToUpsert.length}`);
  console.log(`Image rows to insert       : ${finalImageRows.length}`);
  console.log(`Products with zero images  : ${productsWithZeroImages.length}`);
  console.log(`Duplicate thumb demotions  : ${duplicateThumbCount}\n`);

  // --- Write --------------------------------------------------------------

  if (!IS_DRY_RUN) {
    console.log(`Upserting ${productsToUpsert.length} products (brand/category/vendor FKs preserved)...`);
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

    console.log(`Deleting existing product_images for ${productIds.length} products...`);
    const { error: delImgErr } = await supabase
      .from("product_images")
      .delete()
      .in("product_id", productIds);
    if (delImgErr) throw new Error(`Delete product_images failed: ${delImgErr.message}`);

    const imageInsertRows = finalImageRows
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
  }

  // --- Summary ------------------------------------------------------------

  console.log("\n=============== SUMMARY ===============");
  console.log(`Mode                       : ${IS_DRY_RUN ? "DRY RUN — no writes" : "LIVE"}`);
  console.log(`Products upserted          : ${productsToUpsert.length}`);
  console.log(`Image rows written         : ${finalImageRows.length}`);
  console.log(`Products with zero images  : ${productsWithZeroImages.length}`);
  for (const sku of productsWithZeroImages) console.log(`   - ${sku}`);
  console.log(`Rows skipped               : ${rowsSkipped.length}`);
  for (const s of rowsSkipped) console.log(`   - ${s.identifier}: ${s.reason}`);
  console.log(`Warnings                   : ${warnings.length}`);
  for (const w of warnings.slice(0, 20)) console.log(`   • ${w}`);
  if (warnings.length > 20) console.log(`   • ... and ${warnings.length - 20} more`);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nFATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
