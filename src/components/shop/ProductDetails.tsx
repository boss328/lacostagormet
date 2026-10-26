'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ProductGallery, type GalleryImage } from './ProductGallery';
import { ProductAddPanel } from './ProductAddPanel';
import { ProductPackOptions } from './ProductPackOptions';
import { ProductDescription } from './ProductDescription';
import { formatPackSize } from '@/lib/pack-size';
import { isAvailableForPurchase } from '@/lib/product-availability';
import { getPackPricing, packSavingsForOption, productCartItem, productPackOptions, productDisplayName } from '@/lib/product-pack-options';

export type ProductDetailData = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  description: string | null;
  short_description: string | null;
  pack_size: string | null;
  units_per_pack: number | null;
  pack_parent_id: string | null;
  pack_unit_label: string | null;
  weight_lb: number | string | null;
  retail_price: number | string;
  upc: string | null;
  stock_status: string | null;
  brand_id: string | null;
  primary_category_id: string | null;
  brands: { id: string; name: string; slug: string } | null;
  primary_category: { id: string; name: string; slug: string } | null;
  product_images: Array<{
    url: string;
    alt_text: string | null;
    is_primary: boolean;
    display_order: number;
  }> | null;
  product_categories: Array<{
    categories: { id: string; name: string; slug: string } | null;
  }> | null;
};

function sortImages(
  raw: ProductDetailData['product_images'],
): GalleryImage[] {
  if (!raw || raw.length === 0) return [];
  return [...raw]
    .sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return a.display_order - b.display_order;
    })
    .map((i) => ({ url: i.url, alt_text: i.alt_text }));
}

const PACK_SUFFIX_WORDS = new Set([
  // Vessels
  'bag', 'bags', 'can', 'cans', 'canister', 'canisters', 'bottle', 'bottles',
  'pouch', 'pouches', 'container', 'containers', 'carton', 'cartons',
  'jug', 'jugs', 'pack', 'packs', 'box', 'boxes', 'cup', 'cups',
  'case', 'cases', 'of',
  // Units
  'lb', 'lbs', 'oz', 'ozs', 'kg', 'g', 'ct', 'count',
  // Count words
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve',
]);

/**
 * Picks the italic-accent word for the product headline. Walks tokens
 * right-to-left, skipping pack-size tokens (counts, units, vessel names,
 * and bare numbers), and italicises the first substantive word found.
 */
function renderProductName(name: string) {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length === 1) {
    return <em className="type-accent">{name}</em>;
  }
  let accentIdx = tokens.length - 1;
  for (let i = tokens.length - 1; i >= 1; i--) {
    const raw = tokens[i];
    const letters = raw.toLowerCase().replace(/[^a-z]/g, '');
    const isNumeric = /^[\d.,]+$/.test(raw);
    const isPackWord = letters.length > 0 && PACK_SUFFIX_WORDS.has(letters);
    if (!isNumeric && !isPackWord) {
      accentIdx = i;
      break;
    }
  }
  const before = tokens.slice(0, accentIdx).join(' ');
  const after = tokens.slice(accentIdx + 1).join(' ');
  return (
    <>
      {before && <>{before} </>}
      <em className="type-accent">{tokens[accentIdx]}</em>
      {after && <> {after}</>}
    </>
  );
}

/** Keep every visible detail and the cart payload tied to the selected SKU. */
export function ProductDetails({ product: initialProduct, options }: {
  product: ProductDetailData;
  options: ProductDetailData[];
}) {
  const [selectedId, setSelectedId] = useState(initialProduct.id);
  const packOptions = productPackOptions(initialProduct, options);
  const product = packOptions.find(option => option.id === selectedId) ?? initialProduct;
  const gallery = sortImages(product.product_images);
  const brandName = product.brands?.name ?? null;
  const packPricing = getPackPricing(product);
  const savings = isAvailableForPurchase(product.stock_status) ? packSavingsForOption(product, packOptions) : null;
  const pack = packPricing?.sizeLabel ?? formatPackSize(product.pack_size);
  const displayName = productDisplayName(product, brandName);
  const weight = product.weight_lb
    ? `${Number(product.weight_lb).toFixed(2).replace(/\.00$/, '')} lb`
    : null;

  // Tag row — unique categories, excluding the primary (it's in the breadcrumb)
  const tagSet = new Map<string, { id: string; name: string; slug: string }>();
  for (const row of product.product_categories ?? []) {
    if (row.categories) tagSet.set(row.categories.id, row.categories);
  }
  if (product.primary_category_id) tagSet.delete(product.primary_category_id);
  const tagList = Array.from(tagSet.values());

  const addItemData = productCartItem(product);

  const categoryCrumb = product.primary_category
    ? { href: `/shop/${product.primary_category.slug}`, label: product.primary_category.name }
    : null;

  return (
    <>
      {/* Breadcrumb */}
      <section className="bg-paper">
        <div className="max-w-content mx-auto px-8 pt-10 pb-2 max-md:px-4 max-md:pt-4">
          <nav
            aria-label="Breadcrumb"
            className="type-data-mono text-ink-muted flex items-center gap-2 flex-wrap"
          >
            <Link href="/" className="hover:text-brand-deep transition-colors duration-200">
              Home
            </Link>
            <span aria-hidden="true" className="text-ink-muted/60">·</span>
            <Link href="/shop" className="hover:text-brand-deep transition-colors duration-200">
              Shop
            </Link>
            {categoryCrumb && (
              <>
                <span aria-hidden="true" className="text-ink-muted/60">·</span>
                <Link
                  href={categoryCrumb.href}
                  className="hover:text-brand-deep transition-colors duration-200"
                >
                  {categoryCrumb.label}
                </Link>
              </>
            )}
            <span aria-hidden="true" className="text-ink-muted/60">·</span>
            <span className="text-ink truncate max-w-[50ch]">{displayName}</span>
          </nav>
        </div>
      </section>

      {/* Main 2-column hero */}
      <section className="bg-paper">
        <div className="max-w-content mx-auto px-8 pt-8 pb-20 max-md:px-4 max-md:pt-4 max-md:pb-8">
          <div className="grid gap-12 max-lg:gap-8 max-md:gap-5 lg:grid-cols-[1.15fr_1fr]">
            {/* Gallery — capped on mobile so it doesn't dominate the viewport */}
            <div className="product-gallery-shell relative">
              <ProductGallery
                key={product.id}
                images={gallery}
                productName={product.name}
                brandName={brandName}
                sku={product.sku}
              />
              {packPricing && <span className="product-pack-badge">{packPricing.badge}</span>}
            </div>

            {/* Info panel */}
            <div className="flex flex-col gap-6 lg:pl-4 lg:pt-4 max-md:gap-4">
              {brandName && (
                <Link
                  href={product.brands ? `/brand/${product.brands.slug}` : '#'}
                  className="type-label text-brand-deep hover:text-ink transition-colors duration-200 self-start"
                >
                  {brandName}
                </Link>
              )}

              <h1 className="product-title">{renderProductName(displayName)}</h1>

              <p className="type-data-mono text-ink-muted">SKU · {product.sku}</p>

              <div aria-live="polite" aria-atomic="true" className="product-selected-price">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="type-price max-md:!text-[28px]" style={{ fontSize: '40px', lineHeight: 1 }}>
                    ${Number(product.retail_price).toFixed(2)}
                  </span>
                  {pack && <span className="type-data-mono text-ink-muted">{pack}</span>}
                </div>
                {packPricing && (
                  <p className="pack-unit-price product-selected-unit-price">
                    ${packPricing.unitPrice.toFixed(2)} per {packPricing.label}
                  </p>
                )}
                {packPricing && savings !== null && savings > 0 && (
                  <p className="pack-option-saving product-selected-saving">
                    Save ${savings.toFixed(2)} vs. {packPricing.units} single {packPricing.pluralLabel}
                  </p>
                )}
              </div>

              <ProductPackOptions options={packOptions} selectedId={product.id} onSelect={setSelectedId} />

              <ProductAddPanel key={product.id} item={addItemData} available={isAvailableForPurchase(product.stock_status)} />

              {tagList.length > 0 && (
                <div
                  className="flex flex-wrap gap-2 pt-6"
                  style={{ borderTop: '1px solid var(--rule)' }}
                >
                  <span className="type-label-sm text-ink-muted mr-2 self-center">
                    Also in
                  </span>
                  {tagList.map((t) => (
                    <Link
                      key={t.id}
                      href={`/shop/${t.slug}`}
                      className="type-label-sm text-ink hover:text-cream hover:bg-ink transition-colors duration-200"
                      style={{
                        padding: '6px 10px',
                        border: '1px solid var(--rule-strong)',
                      }}
                    >
                      {t.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Description block */}
      <section
        className="bg-paper-2"
        style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}
      >
        <div className="max-w-content mx-auto px-8 py-20 max-md:px-4 max-md:py-8">
          <div className="grid gap-14 max-lg:gap-10 max-md:gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="type-label text-accent mb-6">About this product</p>
              <ProductDescription html={product.description} />
            </div>
            <aside>
              <p className="type-label text-accent mb-6">Details</p>
              <dl
                className="flex flex-col"
                style={{ borderTop: '1px solid var(--rule-strong)' }}
              >
                {pack && (
                  <DetailRow label="Pack" value={pack} />
                )}
                {brandName && (
                  <DetailRow label="Brand" value={brandName} />
                )}
                {product.primary_category && (
                  <DetailRow label="Category" value={product.primary_category.name} />
                )}
                {weight && (
                  <DetailRow label="Shipping weight" value={weight} />
                )}
                {product.units_per_pack && (
                  <DetailRow label="Units / pack" value={String(product.units_per_pack)} />
                )}
                <DetailRow label="SKU" value={product.sku} />
                {product.upc && (
                  <DetailRow label="UPC" value={product.upc} />
                )}
              </dl>
            </aside>
          </div>
        </div>
      </section>

    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-6 py-3.5"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <dt className="type-label-sm text-ink-muted">{label}</dt>
      <dd className="type-product text-ink text-right">{value}</dd>
    </div>
  );
}
