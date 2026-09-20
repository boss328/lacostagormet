import { notFound } from 'next/navigation';
import { getCatalog } from '@/lib/catalog-query';
import { filterCatalog } from '@/lib/catalog-filter';
import { COLLECTIONS } from '@/lib/collections';
import { firstValue, parsePage, parseSort } from '@/lib/catalog-state';
import { PageHeader } from './PageHeader';
import { CatalogFilters } from './CatalogFilters';
import { ProductGrid } from './ProductGrid';

export async function CatalogListing({
  searchParams,
  category,
  brand,
  search = false,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  category?: string;
  brand?: string;
  search?: boolean;
}) {
  const catalog = await getCatalog();
  const collection = COLLECTIONS.find((c) => c.slug === category);
  const categoryRow = catalog.categories.find((c) => c.slug === category);
  const brandRow = catalog.brands.find((b) => b.slug === brand);
  if ((category && !collection && !categoryRow) || (brand && !brandRow))
    notFound();
  const filters = {
    category: category ?? firstValue(searchParams.category),
    brand: brand ?? firstValue(searchParams.brand),
    q: firstValue(searchParams.q)?.trim() ?? '',
    sort: parseSort(searchParams.sort),
    page: parsePage(searchParams.page),
  };
  const result = filterCatalog(catalog, filters);
  const path = category
    ? `/shop/${category}`
    : brand
      ? `/brand/${brand}`
      : search
        ? '/search'
        : '/shop';
  const title =
    collection?.name ??
    categoryRow?.name ??
    brandRow?.name ??
    (search ? 'Find your next favorite.' : 'All products.');
  const extraCategories = catalog.categories.filter(
    (c) =>
      !COLLECTIONS.some(
        (collection) =>
          collection.slug === c.slug || collection.source === c.slug,
      ),
  );
  const options = [...COLLECTIONS, ...extraCategories].map((c) => ({
    value: c.slug,
    label: c.name,
  }));
  const specialty = catalog.categories.find(
    (c) => c.slug === 'specialty-beverages',
  );
  if (specialty)
    options.push({ value: specialty.slug, label: 'All specialty beverages' });
  // Keep an incoming legacy category selected without duplicate menu labels.
  const selectedLegacy = catalog.categories.find(
    (c) => c.slug === filters.category,
  );
  if (selectedLegacy && !options.some((o) => o.value === selectedLegacy.slug))
    options.push({ value: selectedLegacy.slug, label: selectedLegacy.name });
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/', label: 'Home' },
          ...(category || brand ? [{ href: '/shop', label: 'Shop' }] : []),
          { label: title },
        ]}
        eyebrow={brand ? 'Shop by brand' : 'Made for your everyday'}
        title={title}
        lede={
          search
            ? 'Search by product, brand or SKU. Narrow your results below.'
            : 'The ingredients you love. For your home, café, and everything in between.'
        }
        banner={
          collection
            ? {
                src: `/storefront/${collection.image}.webp`,
                alt: collection.alt,
              }
            : undefined
        }
      />
      <CatalogFilters
        key={JSON.stringify([path, filters])}
        path={path}
        filters={filters}
        hideBrand={Boolean(brand)}
        hideCategory={Boolean(category)}
        brands={catalog.brands.map((b) => ({ value: b.slug, label: b.name }))}
        categories={options}
        total={result.total}
      />
      <section className="catalog-results wrap" aria-label="Product results">
        <ProductGrid
          {...result}
          basePath={path}
          searchParams={searchParams}
          resetHref={path}
        />
      </section>
    </>
  );
}
