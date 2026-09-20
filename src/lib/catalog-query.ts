import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import {
  filterCatalog,
  type CatalogProduct,
  type CatalogCategory,
  type CatalogBrand,
  type CatalogFilters,
} from './catalog-filter';
export {
  PAGE_SIZE,
  SORT_OPTIONS,
  parsePage,
  parseSort,
  firstValue,
} from './catalog-state';
export type { SortKey } from './catalog-state';
export type ProductWithJustIn = CatalogProduct;

// Request-scoped cache: admin edits are visible on the next request. Only
// public catalog fields are loaded, using the existing anonymous/RLS client.
export const getCatalog = cache(async () => {
  const db = createClient();
  const [categories, brands] = await Promise.all([
    db
      .from('categories')
      .select('id, name, slug, parent_id')
      .eq('is_active', true)
      .order('display_order'),
    db
      .from('brands')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('name'),
  ]);
  if (categories.error || brands.error)
    throw new Error('The catalog could not be loaded. Please try again.');
  const products: CatalogProduct[] = [];
  // Batches avoid the API row cap. Only one page is rendered/sent to the browser.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from('products')
      .select(
        'id, slug, sku, name, description, pack_size, retail_price, stock_status, brand_id, primary_category_id, created_at, is_featured, brands(name, slug), product_categories(category_id), product_images(url, alt_text, is_primary, display_order)',
      )
      .eq('is_active', true)
      .order('id')
      .range(offset, offset + 499);
    if (error)
      throw new Error('The catalog could not be loaded. Please try again.');
    products.push(...((data ?? []) as unknown as CatalogProduct[]));
    if ((data?.length ?? 0) < 500) break;
  }
  return {
    products,
    categories: (categories.data ?? []) as CatalogCategory[],
    brands: (brands.data ?? []) as CatalogBrand[],
  };
});
export async function queryCatalog(filters: CatalogFilters) {
  return filterCatalog(await getCatalog(), filters);
}
export function isJustIn(product: ProductWithJustIn, threshold: string | null) {
  return (
    product.is_featured || Boolean(threshold && product.created_at > threshold)
  );
}
