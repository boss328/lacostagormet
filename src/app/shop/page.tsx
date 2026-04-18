import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shop/PageHeader';
import { FilterBar } from '@/components/shop/FilterBar';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { italicLastWord } from '@/lib/headline';
import {
  queryCatalog,
  parseSort,
  parsePage,
  firstValue,
} from '@/lib/catalog-query';

type ShopPageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export const metadata = {
  title: 'The Catalog',
  description:
    'Bulk cafe supplies — chai, cocoa, frappé bases, smoothies, syrups. Fourteen brands, shipped from Carlsbad since 2003.',
};

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const brandSlug = firstValue(searchParams.brand);
  const categorySlug = firstValue(searchParams.category);
  const sort = parseSort(searchParams.sort);
  const page = parsePage(searchParams.page);

  const supabase = createClient();

  // Resolve slug filters → IDs
  const [brandRes, catRes] = await Promise.all([
    brandSlug
      ? supabase.from('brands').select('id, slug').eq('slug', brandSlug).maybeSingle()
      : Promise.resolve({ data: null }),
    categorySlug
      ? supabase
          .from('categories')
          .select('id, slug')
          .eq('slug', categorySlug)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const brandId = (brandRes.data as { id: string } | null)?.id ?? null;
  const categoryId = (catRes.data as { id: string } | null)?.id ?? null;

  const { products, total, justInThreshold } = await queryCatalog({
    brandId,
    categoryId,
    sort,
    page,
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: '/', label: 'Home' }, { label: 'The Catalog' }]}
        eyebrow="§ THE CATALOG"
        title={italicLastWord('All products.')}
        lede="One hundred twenty-one active SKUs across fourteen brands, shipped from Carlsbad since 2003."
      />

      <FilterBar
        total={total}
        showing={products.length}
        currentBrand={brandSlug}
        currentCategory={categorySlug}
        currentSort={sort}
      />

      <section className="max-w-content mx-auto px-8 py-14 max-sm:px-5 max-sm:py-10">
        <ProductGrid
          products={products}
          total={total}
          page={page}
          basePath="/shop"
          searchParams={searchParams}
          justInThreshold={justInThreshold}
          resetHref="/shop"
        />
      </section>
    </>
  );
}

export const dynamic = 'force-dynamic';
