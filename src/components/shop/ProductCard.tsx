import Link from 'next/link';
import { ProductImage as FramedProductImage } from './ProductImage';
import { ProductCardAdd } from './ProductCardAdd';
import { bcImage } from '@/lib/bcImage';
import { formatPackSize } from '@/lib/pack-size';
import { isAvailableForPurchase } from '@/lib/product-availability';
import { getPackPricing, primaryProductImage, productCartItem } from '@/lib/product-pack-options';
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
  brands?: { name: string; slug: string } | null;
  product_images?: ProductImage[] | null;
};
export function ProductCard({
  product,
  priority = false,
  compact = false,
}: {
  product: ProductCardData;
  showJustIn?: boolean;
  priority?: boolean;
  compact?: boolean;
}) {
  const img = primaryProductImage(product);
  const price = Number(product.retail_price);
  const pack = getPackPricing(product);
  const displayName = product.name.split(/\s-\s/)[0];
  const image = img ? (
    <FramedProductImage
      src={bcImage(img.url, 'mid')}
      alt={product.name}
      sizes="(min-width: 1024px) 280px, 45vw"
      priority={priority}
      className="product-card-img"
    />
  ) : (
    <span className="image-placeholder">
      {product.brands?.name ?? 'La Costa Gourmet'}
      <small>{product.sku}</small>
    </span>
  );
  if (compact)
    return (
      <article className="catalog-card">
        <Link href={`/product/${product.slug}`}>
          <div className="catalog-card-heading">
            <h2>{displayName}</h2>
            <span>${price.toFixed(2)}</span>
            {pack && <p className="pack-unit-price">${pack.unitPrice.toFixed(2)} per {pack.label}</p>}
          </div>
          <div className="product-picture">
            {image}
            {pack && <span className="product-pack-badge">{pack.badge}</span>}
            <span className="product-open" aria-hidden="true">
              +
            </span>
          </div>
        </Link>
      </article>
    );
  return (
    <article className="product-card">
      <Link
        href={`/product/${product.slug}`}
        className="product-picture"
        aria-label={product.name}
      >
        {image}
        {pack && <span className="product-pack-badge">{pack.badge}</span>}
      </Link>
      <div className="product-card-copy">
        <p className="product-brand">{product.brands?.name}</p>
        <Link href={`/product/${product.slug}`}>
          <h3>{displayName}</h3>
        </Link>
        <p className="product-pack">
          {formatPackSize(product.pack_size) ?? pack?.badge ?? 'See product for pack size'}
        </p>
        <div className="product-purchase">
          <div>
            <span className="type-price">${price.toFixed(2)}</span>
            {pack && <p className="pack-unit-price">${pack.unitPrice.toFixed(2)} per {pack.label}</p>}
          </div>
          {!isAvailableForPurchase(product.stock_status) ? (
            <span className="product-pack">Out of stock</span>
          ) : (
            <ProductCardAdd item={productCartItem(product)} />
          )}
        </div>
        <Link
          className="text-link product-details"
          href={`/product/${product.slug}`}
        >
          Product details ›
        </Link>
      </div>
    </article>
  );
}
