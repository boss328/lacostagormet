'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ProductImage as FramedProductImage } from './ProductImage';
import { ProductCardAdd } from './ProductCardAdd';
import { bcImage } from '@/lib/bcImage';
import { formatPackSize } from '@/lib/pack-size';
import { isAvailableForPurchase } from '@/lib/product-availability';
import { getPackPricing, packSavingsForOption, primaryProductImage, productCartItem, productDisplayName, productPackOptions } from '@/lib/product-pack-options';
type ProductImage = {
  url: string;
  alt_text: string | null;
  is_primary: boolean;
  display_order: number;
};
export type ProductCardData = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  pack_size: string | null;
  pack_parent_id?: string | null;
  units_per_pack?: number | null;
  pack_unit_label?: string | null;
  retail_price: number | string;
  stock_status?: string | null;
  is_active?: boolean;
  deleted_at?: string | null;
  brands?: { name: string; slug: string } | null;
  product_images?: ProductImage[] | null;
  pack_options?: ProductCardData[];
};
type ProductCardProps = {
  product: ProductCardData;
  showJustIn?: boolean;
  priority?: boolean;
  compact?: boolean;
};

export function ProductCard(props: ProductCardProps) {
  return <SelectableProductCard key={props.product.id} {...props} />;
}

function SelectableProductCard({
  product,
  priority = false,
  compact = false,
}: ProductCardProps) {
  const [selectedId, setSelectedId] = useState(product.id);
  const options = productPackOptions(product, product.pack_options ?? [])
    .filter(option => option.is_active !== false && !option.deleted_at);
  // Resolve against current props so refreshed prices and removed options never
  // leave stale product data attached to an Add to cart button.
  const selected = selectedId === product.id
    ? product
    : options.find(option => option.id === selectedId) ?? product;
  const img = primaryProductImage(selected);
  const price = Number(selected.retail_price);
  const pack = getPackPricing(selected);
  const savings = isAvailableForPurchase(selected.stock_status)
    ? packSavingsForOption(selected, options)
    : null;
  const displayName = pack ? productDisplayName(selected, selected.brands?.name) : selected.name.split(/\s-\s/)[0];
  const image = img ? (
    <FramedProductImage
      src={bcImage(img.url, 'mid')}
      alt={selected.name}
      sizes="(min-width: 1024px) 280px, 45vw"
      priority={priority}
      className="product-card-img"
    />
  ) : (
    <span className="image-placeholder">
      {selected.brands?.name ?? 'La Costa Gourmet'}
      <small>{selected.sku}</small>
    </span>
  );
  if (compact)
    return (
      <article className="catalog-card">
        <Link href={`/product/${selected.slug}`}>
          <div className="catalog-card-heading">
            <h2>{displayName}</h2>
            <span aria-live="polite" aria-atomic="true">${price.toFixed(2)}</span>
            {pack && <p className="product-card-size">{pack.sizeLabel}</p>}
            {pack && <p className="pack-unit-price">${pack.unitPrice.toFixed(2)} per {pack.label}</p>}
            {pack && savings !== null && <p className="product-card-selected-saving">Save ${savings.toFixed(2)} vs. {pack.units} single {pack.pluralLabel}</p>}
          </div>
          <div className="product-picture">
            {image}
            {pack && <span className="product-pack-badge">{pack.badge}</span>}
            <span className="product-open" aria-hidden="true">
              +
            </span>
          </div>
        </Link>
        <CardPackOptions product={selected} options={options} onSelect={setSelectedId} />
      </article>
    );
  return (
    <article className="product-card">
      <Link
        href={`/product/${selected.slug}`}
        className="product-picture"
        aria-label={selected.name}
      >
        {image}
        {pack && <span className="product-pack-badge">{pack.badge}</span>}
      </Link>
      <div className="product-card-copy">
        <p className="product-brand">{selected.brands?.name}</p>
        <Link href={`/product/${selected.slug}`}>
          <h3>{displayName}</h3>
        </Link>
        <p className="product-pack">
          {pack?.sizeLabel ?? formatPackSize(selected.pack_size) ?? 'See product for pack size'}
        </p>
        <div className="product-purchase">
          <div aria-live="polite" aria-atomic="true">
            <span className="type-price">${price.toFixed(2)}</span>
            {pack && <p className="pack-unit-price">${pack.unitPrice.toFixed(2)} per {pack.label}</p>}
            {pack && savings !== null && <p className="product-card-selected-saving">Save ${savings.toFixed(2)} vs. {pack.units} single {pack.pluralLabel}</p>}
          </div>
          {!isAvailableForPurchase(selected.stock_status) ? (
            <span className="product-pack">Out of stock</span>
          ) : (
            <ProductCardAdd key={selected.id} item={productCartItem(selected)} />
          )}
        </div>
        <CardPackOptions product={selected} options={options} onSelect={setSelectedId} />
        <Link
          className="text-link product-details"
          href={`/product/${selected.slug}`}
        >
          Product details ›
        </Link>
      </div>
    </article>
  );
}

function CardPackOptions({ product, options, onSelect }: {
  product: ProductCardData;
  options: ProductCardData[];
  onSelect: (id: string) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div className="product-card-packs" role="group" aria-label={`Choose size for ${productDisplayName(product, product.brands?.name)}`}>
      <p className="product-card-packs-title">Size</p>
      <div className="product-card-pack-options">
        {options.map(option => {
          const pack = getPackPricing(option);
          if (!pack) return null;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === product.id}
              onClick={() => onSelect(option.id)}
              className={`product-card-pack-link${option.id === product.id ? ' is-shown' : ''}`}
            >
              <span>{pack.selectionLabel}</span>
              {!isAvailableForPurchase(option.stock_status) && <span className="pack-option-unavailable">Out of stock</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
