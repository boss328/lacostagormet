import { createClient } from '@/lib/supabase/server';
import { Reveal } from '@/components/design-system/Reveal';
import { SectionHead } from '@/components/design-system/SectionHead';
import { Ticker } from '@/components/layout/Ticker';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeStory } from '@/components/home/HomeStory';
import { HomeB2BBand } from '@/components/home/HomeB2BBand';
import { ProductCard, type ProductCardData } from '@/components/shop/ProductCard';
import { CategoryTile, type CategoryTileData } from '@/components/shop/CategoryTile';
import { BrandRow, type BrandRowData } from '@/components/shop/BrandRow';
import { CATEGORY_IMAGES } from '@/lib/placeholder-images';

const TICKER_ITEMS = [
  'Free shipping over $70 · continental US',
  'Volume pricing at $400 & $700',
  'Family-owned since 2003',
  'Carlsbad, California · Shipping nationwide',
  'Monday thru Friday, 9–5 PT',
];

/** Assemble home data in parallel — anon client, RLS handles visibility. */
async function fetchHomeData() {
  const supabase = createClient();

  const [categoriesRes, productsRes, brandsRes, categoryCountsRes, brandCountsRes] =
    await Promise.all([
      supabase
        .from('categories')
        .select('id, name, slug, display_order')
        .is('parent_id', null)
        .eq('is_active', true)
        .order('display_order'),

      supabase
        .from('products')
        .select(
          'id, slug, sku, name, pack_size, retail_price, brands(name, slug), product_images(url, alt_text, is_primary, display_order)',
        )
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(4),

      supabase
        .from('brands')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('name'),

      // Per-category item count via m2m join table
      supabase
        .from('product_categories')
        .select('category_id, products!inner(is_active)')
        .eq('products.is_active', true),

      // Per-brand item count via FK
      supabase
        .from('products')
        .select('brand_id')
        .eq('is_active', true),
    ]);

  const categoryCounts = new Map<string, number>();
  for (const row of categoryCountsRes.data ?? []) {
    categoryCounts.set(row.category_id, (categoryCounts.get(row.category_id) ?? 0) + 1);
  }

  const brandCounts = new Map<string, number>();
  for (const row of brandCountsRes.data ?? []) {
    if (row.brand_id) {
      brandCounts.set(row.brand_id, (brandCounts.get(row.brand_id) ?? 0) + 1);
    }
  }

  const categories: CategoryTileData[] = (categoriesRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    display_order: c.display_order,
    itemCount: categoryCounts.get(c.id) ?? 0,
  }));

  const featured = (productsRes.data ?? []) as unknown as ProductCardData[];

  const brands: BrandRowData[] = (brandsRes.data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    itemCount: brandCounts.get(b.id) ?? 0,
  }));

  return { categories, featured, brands };
}

export default async function HomePage() {
  const { categories, featured, brands } = await fetchHomeData();

  return (
    <>
      {/* [1] Hero — page-load stagger */}
      <HomeHero />

      {/* [2] Ticker */}
      <Ticker items={TICKER_ITEMS} />

      {/* [3] Categories */}
      <Reveal as="section" className="bg-paper">
        <div className="max-w-content mx-auto px-8 pt-20 pb-14 max-md:px-5 max-md:pt-10 max-md:pb-8">
          <SectionHead
            numeral="I"
            eyebrow="The Departments"
            title="Shop by {italic}category{/italic}."
            link={{ href: '/shop', label: 'View All' }}
          />
          <div
            className="grid gap-px max-lg:grid-cols-3 max-sm:grid-cols-2 lg:grid-cols-6"
            style={{ background: 'var(--rule)' }}
          >
            {categories.map((cat, i) => (
              <CategoryTile
                key={cat.id}
                category={cat}
                image={
                  CATEGORY_IMAGES[cat.slug] ?? {
                    src: 'https://images.unsplash.com/photo-1542990253-0b8be8040f3a?w=1200&auto=format&fit=crop&q=80',
                    alt: cat.name,
                  }
                }
                index={i}
              />
            ))}
          </div>
        </div>
      </Reveal>

      {/* [4] Featured / New Arrivals */}
      <Reveal
        as="section"
        className="relative"
      >
        <div
          className="relative"
          style={{
            background: 'linear-gradient(to bottom, var(--color-paper-2) 0%, var(--color-paper) 100%)',
            borderTop: '1px solid var(--rule)',
            borderBottom: '1px solid var(--rule)',
          }}
        >
          {/* Subtle 45deg diagonal texture */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(26, 17, 10, 0.015) 0 1px, transparent 1px 6px)',
            }}
          />
          <div className="relative max-w-content mx-auto px-8 pt-20 pb-16 max-md:px-5 max-md:pt-10 max-md:pb-10">
            <SectionHead
              numeral="II"
              eyebrow="Fresh on the shelf"
              title="New {italic}arrivals{/italic}."
              link={{ href: '/shop?sort=new', label: 'Shop New' }}
            />
            {featured.length > 0 ? (
              <div className="grid gap-5 max-lg:grid-cols-2 max-md:gap-3 lg:grid-cols-4">
                {featured.map((p) => (
                  <ProductCard key={p.id} product={p} showJustIn />
                ))}
              </div>
            ) : (
              <p className="type-body text-ink-muted">No products yet. Add one from the admin.</p>
            )}
          </div>
        </div>
      </Reveal>

      {/* [5] Story */}
      <Reveal>
        <HomeStory />
      </Reveal>

      {/* [6] Brands directory */}
      <Reveal as="section" className="bg-paper">
        <div className="max-w-content mx-auto px-8 pt-20 pb-16 max-sm:px-5 max-sm:pt-14">
          <SectionHead
            numeral="III"
            eyebrow="The directory"
            title="Fourteen brands, {italic}one roof{/italic}."
            link={{ href: '/brand', label: 'All Brands' }}
          />
          <div
            className="grid gap-px max-lg:grid-cols-2 max-sm:grid-cols-1 lg:grid-cols-4"
            style={{ background: 'var(--rule)' }}
          >
            {brands.map((b) => (
              <BrandRow key={b.id} brand={b} />
            ))}
          </div>
        </div>
      </Reveal>

      {/* [7] B2B band */}
      <Reveal>
        <HomeB2BBand />
      </Reveal>
    </>
  );
}
