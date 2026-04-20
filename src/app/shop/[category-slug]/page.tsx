import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createStaticClient } from '@/lib/supabase/static';
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
import { categoryCopy } from '@/lib/category-copy';
import { CATEGORY_IMAGES } from '@/lib/placeholder-images';

type CategoryPageProps = {
  params: { 'category-slug': string };
  searchParams: Record<string, string | string[] | undefined>;
};

export async function generateStaticParams() {
  const supabase = createStaticClient();
  const { data } = await supabase
    .from('categories')
    .select('slug')
    .is('parent_id', null)
    .eq('is_active', true);
  return (data ?? []).map((c) => ({ 'category-slug': c.slug }));
}

export async function generateMetadata({ params }: CategoryPageProps) {
  const supabase = createStaticClient();
  const slug = params['category-slug'];
  const { data } = await supabase
    .from('categories')
    .select('name, description')
    .eq('slug', slug)
    .maybeSingle();

  if (!data) return { title: 'Not Found' };
  return {
    title: data.name,
    description: data.description ?? categoryCopy(slug),
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const slug = params['category-slug'];
  const sort = parseSort(searchParams.sort);
  const page = parsePage(searchParams.page);
  const brandSlug = firstValue(searchParams.brand);

  const supabase = createClient();

  const { data: category } = await supabase
    .from('categories')
    .select('id, name, slug, description')
    .eq('slug', slug)
    .is('parent_id', null)
    .maybeSingle();

  if (!category) notFound();

  const { data: brandRow } = brandSlug
    ? await supabase.from('brands').select('id').eq('slug', brandSlug).maybeSingle()
    : { data: null as { id: string } | null };

  const { products, total, justInThreshold } = await queryCatalog({
    categoryId: category.id,
    brandId: brandRow?.id ?? null,
    sort,
    page,
  });

  const banner = CATEGORY_IMAGES[slug];
  const lede = category.description?.trim() || categoryCopy(slug);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/', label: 'Home' },
          { href: '/shop', label: 'Shop' },
          { label: category.name },
        ]}
        eyebrow={`§ · ${category.name.toUpperCase()}`}
        title={italicLastWord(`${category.name}.`)}
        lede={lede}
        banner={banner}
      />

      <FilterBar
        total={total}
        showing={products.length}
        currentBrand={brandSlug}
        currentSort={sort}
        hideCategory
      />

      <section className="max-w-content mx-auto px-8 py-14 max-md:px-4 max-md:py-6">
        <ProductGrid
          products={products}
          total={total}
          page={page}
          basePath={`/shop/${slug}`}
          searchParams={searchParams}
          justInThreshold={justInThreshold}
          resetHref={`/shop/${slug}`}
        />
      </section>
    </>
  );
}

export const dynamic = 'force-dynamic';
