import type { CartItem } from '@/stores/cart';
import { bcImage } from './bcImage';
import { packSavingsAmount, packUnitPrice } from './product-packs';
import { isAvailableForPurchase } from './product-availability';

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
  is_active?: boolean;
  deleted_at?: string | null;
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
export function getPackPricing(product: Pick<PackProduct, 'retail_price' | 'units_per_pack' | 'pack_unit_label'> & { pack_size?: string | null }) {
  const units = product.units_per_pack;
  const label = product.pack_unit_label?.trim();
  if (!label || !units || !Number.isInteger(units) || units < 1) return null;
  const unitPrice = packUnitPrice(Number(product.retail_price), units);
  if (unitPrice === null) return null;
  const badge = `${units} ${units === 1 ? label : pluralUnitLabel(label)}`;
  const unitSize = packUnitSize(product.pack_size, units);
  const sizeLabel = unitSize ? `${badge} · ${unitSize}${units > 1 ? ' each' : ''}` : badge;
  return { units, label, pluralLabel: pluralUnitLabel(label), unitPrice, badge, sizeLabel, unitSize };
}

function pluralUnitLabel(label: string) {
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  return `${label}${/(?:s|x|z|ch|sh)$/i.test(label) ? 'es' : 's'}`;
}

const COUNT_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const COUNT = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d+)';
const MEASURE = '(\\d+(?:\\.\\d+)?)\\s*(fl\\s*oz|lbs?|oz|kg|g|ml|l)\\.?';
const VESSEL = '(?:bags?|bottles?|pouches?|cartons?|cans?|canisters?|containers?|jugs?|boxes?|cups?|packs?)';
const COUNTED_SIZE = new RegExp(`^(${COUNT})(?:\\s*[×x]\\s*|\\s+)${MEASURE}(?:\\s+${VESSEL})?\\s*$`, 'i');
const SINGLE_SIZE = new RegExp(`^${MEASURE}(?:\\s+${VESSEL})?\\s*$`, 'i');

/** Read net contents only from explicit pack_size text, never shipping weight. */
export function packUnitSize(packSize: string | null | undefined, units: number): string | null {
  const raw = packSize?.trim();
  if (!raw) return null;
  const counted = raw.match(COUNTED_SIZE);
  if (counted) {
    const count = COUNT_WORDS[counted[1].toLowerCase()] ?? Number(counted[1]);
    if (count !== units || Number(counted[2]) <= 0) return null;
    return `${Number(counted[2])} ${counted[3].toLowerCase().replace(/\s+/g, ' ').replace(/^lbs$/, 'lb')}`;
  }
  const single = units === 1 ? raw.match(SINGLE_SIZE) : null;
  return single && Number(single[1]) > 0
    ? `${Number(single[1])} ${single[2].toLowerCase().replace(/\s+/g, ' ').replace(/^lbs$/, 'lb')}`
    : null;
}

/** Visible copy may omit duplicate brand/pack text; stored names and SEO stay intact. */
export function productDisplayName(product: Pick<PackProduct, 'name' | 'units_per_pack' | 'pack_unit_label'>, brandName?: string | null) {
  let name = product.name.trim();
  if (!product.pack_unit_label || !product.units_per_pack) return name;
  if (brandName && name.toLocaleLowerCase('en-US').startsWith(brandName.toLocaleLowerCase('en-US'))) {
    const afterBrand = name.slice(brandName.length);
    if (/^(?:\s|[—–:·-])/.test(afterBrand)) name = afterBrand.replace(/^[\s—–:·-]+/, '');
  }
  // Remove only an explicit trailing packaging phrase, preserving flavor/dietary text.
  const measure = '\\d+(?:\\.\\d+)?\\s*(?:fl\\s*oz|lbs?|oz|kg|g|ml|l)\\.?';
  const caseName = name.match(new RegExp(`^(.+?),\\s*${measure}\\s+(?:foodservice\\s+)?${VESSEL}\\s*\\(case of ${COUNT}\\)(?:\\s*[—–-]\\s*(.+))?$`, 'i'));
  if (caseName) {
    const title = caseName[1].trim();
    const qualifier = caseName[2]?.trim();
    const titleWords = new Set(title.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    const redundant = qualifier && (qualifier.toLowerCase().match(/[a-z0-9]+/g) ?? []).every(word => titleWords.has(word));
    const servingDetail = qualifier && /^~?\d+(?:\s*[-–]\s*\d+)?\s+servings?\s+per\s+bag$/i.test(qualifier);
    return qualifier && !redundant && !servingDetail ? `${title} · ${qualifier}` : title;
  }
  const suffix = new RegExp(`\\s*(?:[—–·,-]\\s*)?\\(?(?:${COUNT}(?:\\s+(?:[×x]\\s*)?${measure})?\\s+${VESSEL}|${measure}\\s+${VESSEL})\\)?\\s*$`, 'i');
  const shortened = name.replace(suffix, '').trim();
  return shortened || name || product.name;
}

export function packSavingsForOption(option: PackProduct, options: readonly PackProduct[]): number | null {
  const pack = getPackPricing(option);
  const rootId = option.pack_parent_id ?? option.id;
  const single = options.find(candidate => candidate.units_per_pack === 1
    && (candidate.pack_parent_id ?? candidate.id) === rootId
    && candidate.is_active !== false && !candidate.deleted_at
    && isAvailableForPurchase(candidate.stock_status));
  const singlePack = single && getPackPricing(single);
  if (!pack || !single || !singlePack || pack.label !== singlePack.label) return null;
  if (!pack.unitSize || !singlePack.unitSize || pack.unitSize !== singlePack.unitSize) return null;
  return packSavingsAmount(Number(option.retail_price), pack.units, Number(single.retail_price));
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
