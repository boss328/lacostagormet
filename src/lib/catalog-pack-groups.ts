import type { ProductCardData } from '@/components/shop/ProductCard';
import { isAvailableForPurchase } from './product-availability';

type PublicProduct = Omit<ProductCardData, 'pack_options'> & { is_active?: boolean; deleted_at?: string | null };
export type CatalogPackGroup<T extends PublicProduct> = Omit<T, 'pack_options'> & { pack_options?: T[] };

/** Legacy unit counts alone never merge otherwise independent products. */
export function catalogPackKey(product: PublicProduct): string {
  const units = product.units_per_pack;
  const configured = product.pack_unit_label?.trim() && typeof units === 'number'
    && Number.isInteger(units) && units >= 1 && units <= 1000;
  return configured ? `family:${product.pack_parent_id || product.id}` : `product:${product.id}`;
}

function byPackSize(a: PublicProduct, b: PublicProduct): number {
  return (a.units_per_pack ?? 1) - (b.units_per_pack ?? 1)
    || Number(a.retail_price) - Number(b.retail_price)
    || a.id.localeCompare(b.id);
}

/** Lead with one bag's photo, or one canister when the family has no pictured bag. */
function picturedSingle<T extends PublicProduct>(options: readonly T[]): T | undefined {
  const singles = options.filter(option => option.units_per_pack === 1
    && option.product_images?.some(image => image.url.trim()));
  return singles.find(option => option.pack_unit_label?.trim().toLowerCase() === 'bag')
    ?? singles.find(option => ['can', 'canister'].includes(option.pack_unit_label?.trim().toLowerCase() ?? ''));
}

/**
 * Call after category, brand and search filtering, before sorting/pagination.
 * The representative is an actual SKU with its own unchanged price and ID.
 * Only the caller's matching public options appear as size choices.
 */
export function groupCatalogPacks<T extends PublicProduct>(
  products: readonly T[],
  { search = '' }: { search?: string } = {},
): CatalogPackGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const product of products) {
    if (product.is_active === false || product.deleted_at) continue;
    const key = catalogPackKey(product);
    const members = groups.get(key);
    if (members) members.push(product);
    else groups.set(key, [product]);
  }
  const exactSku = search.trim().toLocaleLowerCase('en-US');
  return [...groups.values()].map(members => {
    const options = [...members].sort(byPackSize);
    const representative = (exactSku ? options.find(option => option.sku.toLocaleLowerCase('en-US') === exactSku) : undefined)
      ?? picturedSingle(options)
      ?? options.find(option => isAvailableForPurchase(option.stock_status))
      ?? options[0];
    const selected = { ...representative } as CatalogPackGroup<T>;
    delete selected.pack_options;
    return options.length > 1 ? { ...selected, pack_options: options } : selected;
  });
}

/** A new size makes the family newly available without altering SKU data. */
export function catalogGroupCreatedAt<T extends PublicProduct & { created_at: string }>(product: CatalogPackGroup<T>): string {
  return (product.pack_options ?? [product]).reduce((latest, option) => option.created_at > latest ? option.created_at : latest, product.created_at);
}

/** Preserve featured family ranking while showing its preferred photographed single. */
export function featuredCatalogProducts<T extends PublicProduct & { created_at: string; is_featured: boolean }>(
  products: readonly T[],
  limit = 8,
): CatalogPackGroup<T>[] {
  const allGroups = groupCatalogPacks(products);
  const optionsByFamily = new Map(allGroups.map(product => [catalogPackKey(product), product.pack_options]));
  const featuredRankProduct = (product: CatalogPackGroup<T>) => {
    const options = product.pack_options ?? [product];
    return options.find(option => isAvailableForPurchase(option.stock_status)) ?? options[0];
  };
  const pinned = groupCatalogPacks(products.filter(product => product.is_featured))
    .sort((a, b) => {
      const previousA = featuredRankProduct(a);
      const previousB = featuredRankProduct(b);
      return previousB.created_at.localeCompare(previousA.created_at) || previousA.id.localeCompare(previousB.id);
    })
    .map(product => {
      const options = optionsByFamily.get(catalogPackKey(product));
      const representative = options ? picturedSingle(options) ?? product : product;
      return options ? { ...representative, pack_options: options } : representative;
    });
  const pinnedKeys = new Set(pinned.map(catalogPackKey));
  const fallback = allGroups.filter(product => !pinnedKeys.has(catalogPackKey(product)))
    .sort((a, b) => catalogGroupCreatedAt(b).localeCompare(catalogGroupCreatedAt(a)) || a.id.localeCompare(b.id));
  return [...pinned, ...fallback].slice(0, limit);
}
