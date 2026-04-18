import { createClient } from '@/lib/supabase/server';
import type { ProductCardData } from '@/components/shop/ProductCard';

export type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name-asc';

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'newest',     label: 'Newest first' },
  { value: 'price-asc',  label: 'Price, low to high' },
  { value: 'price-desc', label: 'Price, high to low' },
  { value: 'name-asc',   label: 'Name, A → Z' },
];

export const PAGE_SIZE = 24;

export type CatalogFilters = {
  categoryId?: string | null;
  brandId?: string | null;
  sort?: SortKey;
  page?: number;
};

export type ProductWithJustIn = ProductCardData & {
  created_at: string;
  is_featured: boolean;
};

const PRODUCT_SELECT =
  'id, slug, sku, name, pack_size, retail_price, created_at, is_featured, brands(name, slug), product_images(url, alt_text, is_primary, display_order)';

/**
 * Shared catalog query. Applies filters + sort, returns cumulative page
 * (first `page * PAGE_SIZE` rows) plus total count for "Load more" logic
 * and the just-in threshold for sticker display.
 */
export async function queryCatalog({
  categoryId,
  brandId,
  sort = 'newest',
  page = 1,
}: CatalogFilters): Promise<{
  products: ProductWithJustIn[];
  total: number;
  justInThreshold: string | null;
}> {
  const supabase = createClient();

  const select = categoryId
    ? `${PRODUCT_SELECT}, product_categories!inner(category_id)`
    : PRODUCT_SELECT;

  let query = supabase
    .from('products')
    .select(select, { count: 'exact' })
    .eq('is_active', true);

  if (categoryId) query = query.eq('product_categories.category_id', categoryId);
  if (brandId)   query = query.eq('brand_id', brandId);

  switch (sort) {
    case 'price-asc':  query = query.order('retail_price', { ascending: true  }); break;
    case 'price-desc': query = query.order('retail_price', { ascending: false }); break;
    case 'name-asc':   query = query.order('name',         { ascending: true  }); break;
    case 'newest':
    default:           query = query.order('created_at',   { ascending: false }); break;
  }

  // cumulative — page 1 = first 24, page 2 = first 48, page N = first N*24
  const limit = Math.max(1, page) * PAGE_SIZE;
  query = query.limit(limit);

  const { data, count, error } = await query;
  if (error) throw new Error(`catalog query: ${error.message}`);

  // Resolve the just-in threshold in a second lightweight call:
  // is_featured OR created_at > (MAX(created_at) - 7 days)
  const maxRes = await supabase
    .from('products')
    .select('created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);

  const maxCreated = maxRes.data?.[0]?.created_at ?? null;
  const justInThreshold = maxCreated
    ? new Date(new Date(maxCreated).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  return {
    products: (data ?? []) as unknown as ProductWithJustIn[],
    total: count ?? 0,
    justInThreshold,
  };
}

export function isJustIn(product: ProductWithJustIn, threshold: string | null): boolean {
  if (product.is_featured) return true;
  if (!threshold) return false;
  return product.created_at > threshold;
}

/**
 * Coerce a raw searchParams sort value into a valid SortKey.
 */
export function parseSort(raw: string | string[] | undefined): SortKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  switch (v) {
    case 'price-asc':
    case 'price-desc':
    case 'name-asc':
    case 'newest':
      return v;
    default:
      return 'newest';
  }
}

export function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(v ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function firstValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
