import type { ProductCardData } from '@/components/shop/ProductCard';
import { COLLECTIONS, collectionMembership } from './collections';
import { PAGE_SIZE, parsePage, type SortKey } from './catalog-state';

export type CatalogProduct = ProductCardData & {
  description?: string | null;
  brand_id: string | null;
  primary_category_id: string | null;
  created_at: string;
  is_featured: boolean;
  product_categories: { category_id: string }[];
};
export type CatalogCategory = {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
};
export type CatalogBrand = { id: string; slug: string; name: string };
export type CatalogData = {
  products: CatalogProduct[];
  categories: CatalogCategory[];
  brands: CatalogBrand[];
};
export type CatalogFilters = {
  category?: string;
  brand?: string;
  q?: string;
  sort?: SortKey;
  page?: number;
};

export function categoryDescendants(
  id: string,
  categories: CatalogCategory[],
): Set<string> {
  const ids = new Set([id]);
  for (let size = 0; size !== ids.size; ) {
    size = ids.size;
    for (const category of categories)
      if (category.parent_id && ids.has(category.parent_id))
        ids.add(category.id);
  }
  return ids;
}
export function filterCatalog(data: CatalogData, filters: CatalogFilters) {
  const { category, brand, q = '', sort = 'newest' } = filters;
  const collection = COLLECTIONS.find((c) => c.slug === category);
  const dbCategory = data.categories.find((c) => c.slug === category);
  const categoryIds = dbCategory
    ? categoryDescendants(dbCategory.id, data.categories)
    : new Set<string>();
  const brandRow = data.brands.find((b) => b.slug === brand);
  const search = q.trim().toLocaleLowerCase('en-US');
  const filtered = data.products
    .filter((product) => {
      if (brand && (!brandRow || product.brand_id !== brandRow.id))
        return false;
      const ids = new Set([
        product.primary_category_id,
        ...product.product_categories.map((c) => c.category_id),
      ]);
      if (category) {
        if (collection) {
          const slugs = data.categories
            .filter((c) => ids.has(c.id))
            .map((c) => c.slug);
          if (!collectionMembership(product, slugs).includes(category))
            return false;
        } else if (!dbCategory || ![...categoryIds].some((id) => ids.has(id)))
          return false;
      }
      if (
        search &&
        ![
          product.name,
          product.sku,
          product.brands?.name,
          product.description?.replace(/<[^>]*>/g, ' '),
        ].some((value) => value?.toLocaleLowerCase('en-US').includes(search))
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      const difference =
        sort === 'price-asc'
          ? Number(a.retail_price) - Number(b.retail_price)
          : sort === 'price-desc'
            ? Number(b.retail_price) - Number(a.retail_price)
            : sort === 'name-asc'
              ? a.name.localeCompare(b.name, 'en')
              : b.created_at.localeCompare(a.created_at);
      return difference || a.id.localeCompare(b.id);
    });
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(parsePage(String(filters.page ?? 1)), pageCount);
  const newest = data.products.reduce(
    (value, product) =>
      product.created_at > value ? product.created_at : value,
    '',
  );
  return {
    products: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total,
    page,
    pageCount,
    justInThreshold: newest
      ? new Date(new Date(newest).getTime() - 7 * 86400000).toISOString()
      : null,
  };
}
