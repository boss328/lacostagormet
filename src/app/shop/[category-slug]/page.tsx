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

  // Empty category (no products at all, not just filtered out) gets a
  // dedicated "coming soon" block instead of the filter bar + grid. The
  // filter bar would be noisy and ProductGrid's empty state reads as
  // "no matches" rather than "new category".
  const isEmptyCategory = total === 0 && !brandSlug;

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

      {isEmptyCategory ? (
        <section className="max-w-content mx-auto px-8 py-20 max-md:px-4 max-md:py-12">
          <div
            className="bg-cream text-center mx-auto max-w-[560px]"
            style={{ border: '1px solid var(--rule-strong)', padding: '48px 32px' }}
          >
            <p className="type-label text-accent mb-5">§ New category</p>
            <p
              className="font-display italic text-brand-deep mb-4"
              style={{ fontSize: '28px', lineHeight: 1.1, letterSpacing: '-0.02em', fontWeight: 500 }}
            >
              Products coming soon.
            </p>
            <p
              className="type-body text-ink-2 pl-5 mx-auto text-left max-w-[440px]"
              style={{
                backgroundImage:
                  'linear-gradient(to bottom, var(--color-gold) 0%, transparent 100%)',
                backgroundSize: '1px 100%',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'left top',
              }}
            >
              We&rsquo;re adding new lines to this category. Check back shortly,
              or call <a href="tel:+17609311028" className="text-brand-deep hover:text-ink transition-colors">(760) 931-1028</a> if
              you&rsquo;re after a specific product.
            </p>
          </div>
        </section>
      ) : (
        <>
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
      )}
    </>
  );
}

export const dynamic = 'force-dynamic';
