import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createStaticClient } from '@/lib/supabase/static';
import { PageHeader } from '@/components/shop/PageHeader';
import { FilterBar } from '@/components/shop/FilterBar';
import { ProductGrid } from '@/components/shop/ProductGrid';
import {
  queryCatalog,
  parseSort,
  parsePage,
  firstValue,
} from '@/lib/catalog-query';
import { brandTypology } from '@/lib/brand-meta';

type BrandPageProps = {
  params: { 'brand-slug': string };
  searchParams: Record<string, string | string[] | undefined>;
};

export async function generateStaticParams() {
  const supabase = createStaticClient();
  const { data } = await supabase
    .from('brands')
    .select('slug')
    .eq('is_active', true);
  return (data ?? []).map((b) => ({ 'brand-slug': b.slug }));
}

export async function generateMetadata({ params }: BrandPageProps) {
  const supabase = createStaticClient();
  const slug = params['brand-slug'];
  const { data } = await supabase
    .from('brands')
    .select('name, description')
    .eq('slug', slug)
    .maybeSingle();

  if (!data) return { title: 'Not Found' };
  return {
    title: data.name,
    description:
      data.description ?? `${data.name} products shipped from Carlsbad since 2003.`,
  };
}

export default async function BrandPage({ params, searchParams }: BrandPageProps) {
  const slug = params['brand-slug'];
  const sort = parseSort(searchParams.sort);
  const page = parsePage(searchParams.page);
  const categorySlug = firstValue(searchParams.category);

  const supabase = createClient();

  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, slug, description')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (!brand) notFound();

  const { data: catRow } = categorySlug
    ? await supabase
        .from('categories')
        .select('id')
        .eq('slug', categorySlug)
        .maybeSingle()
    : { data: null as { id: string } | null };

  const { products, total, justInThreshold } = await queryCatalog({
    brandId: brand.id,
    categoryId: catRow?.id ?? null,
    sort,
    page,
  });

  const typology = brandTypology(slug).toUpperCase();
  const eyebrow = typology ? `§ BRAND · ${typology}` : '§ BRAND';
  const lede =
    brand.description?.trim() ||
    `${total} active ${total === 1 ? 'product' : 'products'} from ${brand.name}, shipped direct from Carlsbad.`;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/', label: 'Home' },
          { href: '/brand', label: 'Brands' },
          { label: brand.name },
        ]}
        eyebrow={eyebrow}
        title={
          <em className="type-accent" style={{ fontStyle: 'italic' }}>
            {brand.name}.
          </em>
        }
        lede={lede}
      />

      <FilterBar
        total={total}
        showing={products.length}
        currentCategory={categorySlug}
        currentSort={sort}
        hideBrand
      />

      <section className="max-w-content mx-auto px-8 py-14 max-sm:px-5 max-sm:py-10">
        <ProductGrid
          products={products}
          total={total}
          page={page}
          basePath={`/brand/${slug}`}
          searchParams={searchParams}
          justInThreshold={justInThreshold}
          resetHref={`/brand/${slug}`}
        />
      </section>
    </>
  );
}

export const dynamic = 'force-dynamic';
