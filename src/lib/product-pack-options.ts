import type { CartItem } from '@/stores/cart';
import { bcImage } from './bcImage';
import { packLabel, packUnitPrice } from './product-packs';

export type PackProduct = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  retail_price: number | string;
  pack_size: string | null;
  pack_parent_id?: string | null;
  units_per_pack?: number | null;
  pack_unit_label?: string | null;
  stock_status?: string | null;
  brands?: { name: string; slug: string } | null;
  product_images?: Array<{
    url: string;
    alt_text: string | null;
    is_primary: boolean;
    display_order: number;
  }> | null;
};

// A unit label explicitly enables pack merchandising. Existing catalog items
// may have units_per_pack populated without belonging to a pack family.
export function getPackPricing(product: Pick<PackProduct, 'retail_price' | 'units_per_pack' | 'pack_unit_label'>) {
  const units = product.units_per_pack;
  const label = product.pack_unit_label?.trim();
  if (!label || !units || !Number.isInteger(units) || units < 1) return null;
  const unitPrice = packUnitPrice(Number(product.retail_price), units);
  if (unitPrice === null) return null;
  return { units, label, unitPrice, badge: packLabel(units) };
}

export function primaryProductImage(product: Pick<PackProduct, 'product_images'>) {
  return product.product_images?.find((image) => image.is_primary)
    ?? [...(product.product_images ?? [])].sort((a, b) => a.display_order - b.display_order)[0]
    ?? null;
}

/** Keep the selected product's identity and price together through checkout. */
export function productCartItem(product: PackProduct): Omit<CartItem, 'quantity'> {
  const primary = primaryProductImage(product);
  const pack = getPackPricing(product);
  return {
    product_id: product.id,
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    brand_name: product.brands?.name ?? null,
    price: Number(product.retail_price),
    pack_size: product.pack_size,
    image_url: primary ? bcImage(primary.url, 'mid') : null,
    ...(pack ? { units_per_pack: pack.units, pack_unit_label: pack.label } : {}),
  };
}

export function productPackOptions<T extends PackProduct>(selected: PackProduct, candidates: T[]): T[] {
  const rootId = selected.pack_parent_id ?? selected.id;
  return candidates
    .filter((candidate) =>
      (candidate.id === rootId || candidate.pack_parent_id === rootId)
      && getPackPricing(candidate) !== null,
    )
    .sort((a, b) => (a.units_per_pack! - b.units_per_pack!) || a.id.localeCompare(b.id));
}
