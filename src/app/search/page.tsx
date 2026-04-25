import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shop/PageHeader';
import { ProductCard, type ProductCardData } from '@/components/shop/ProductCard';
import { SearchBox } from '@/components/shop/SearchBox';
import { firstValue } from '@/lib/catalog-query';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Search',
  description: 'Search the La Costa Gourmet catalog by product name, brand, or SKU.',
};

const RESULT_LIMIT = 50;

type SearchPageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

// Customer-facing fields only — never expose cost_price, vendor_id, etc.
const PRODUCT_SELECT =
  'id, slug, sku, name, pack_size, retail_price, brands(name, slug), product_images(url, alt_text, is_primary, display_order)';

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const rawQuery = firstValue(searchParams.q)?.trim() ?? '';
  const hasQuery = rawQuery.length > 0;

  let products: ProductCardData[] = [];

  if (hasQuery) {
    const supabase = createClient();
    // Escape PostgREST `.or()` reserved chars (commas, parens) to avoid
    // breaking the filter syntax when a user types them mid-query.
    const safe = rawQuery.replace(/[,()*]/g, ' ').trim();
    const pattern = `%${safe}%`;

    // Name matches first (boosted), then description / SKU. Two passes
    // keeps name-relevance ordering without a Postgres full-text setup.
    const [nameRes, otherRes] = await Promise.all([
      supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('is_active', true)
        .ilike('name', pattern)
        .order('name', { ascending: true })
        .limit(RESULT_LIMIT),
      supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('is_active', true)
        .or(`description.ilike.${pattern},sku.ilike.${pattern}`)
        .order('name', { ascending: true })
        .limit(RESULT_LIMIT),
    ]);

    const seen = new Set<string>();
    const merged: ProductCardData[] = [];
    for (const row of [...(nameRes.data ?? []), ...(otherRes.data ?? [])] as unknown as ProductCardData[]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
      if (merged.length >= RESULT_LIMIT) break;
    }
    products = merged;
  }

  const total = products.length;
  const lede = hasQuery
    ? `${total} ${total === 1 ? 'match' : 'matches'} for “${rawQuery}”.`
    : 'Search the catalog by product name, brand, or SKU.';

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/', label: 'Home' },
          { label: 'Search' },
        ]}
        eyebrow="§ Search"
        title={
          <>
            Find a <em className="type-accent">product</em>.
          </>
        }
        lede={lede}
      />

      <section className="max-w-content mx-auto px-8 pt-10 pb-6 max-md:px-4 max-md:pt-6">
        <div className="max-w-[640px]">
          <SearchBox initialQuery={rawQuery} />
        </div>
      </section>

      <section className="max-w-content mx-auto px-8 py-10 max-md:px-4 max-md:py-6">
        {!hasQuery ? (
          <p className="type-data-mono text-ink-muted text-center py-16">
            Type a query above and press search.
          </p>
        ) : products.length === 0 ? (
          <div
            className="bg-cream text-center mx-auto max-w-[560px]"
            style={{ border: '1px solid var(--rule-strong)', padding: '48px 32px' }}
          >
            <p className="type-label text-accent mb-5">§ No matches</p>
            <p
              className="font-display italic text-brand-deep mb-4"
              style={{ fontSize: '24px', lineHeight: 1.15, letterSpacing: '-0.02em', fontWeight: 500 }}
            >
              Nothing matched “{rawQuery}”.
            </p>
            <p className="type-body text-ink-2">
              Try a brand name (Big Train, Mocafe), a category (chai, smoothie),
              or a SKU.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 max-lg:grid-cols-2 max-md:gap-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
