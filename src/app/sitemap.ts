import type { MetadataRoute } from 'next';
import { createStaticClient } from '@/lib/supabase/static';

/**
 * Dynamic sitemap.xml generated from Supabase at request time.
 *
 * Routes:
 *   • Static pages (homepage + flat marketing routes)
 *   • One entry per active category
 *   • One entry per active brand
 *   • One entry per active, non-deleted product
 *
 * lastModified comes from each row's updated_at so Google sees fresh
 * timestamps when products / categories / brands are edited in admin.
 *
 * RLS: anon client via createStaticClient — RLS policies hide soft-
 * deleted rows from the public catalog, which matches what we want here.
 */

const SITE = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lacostagourmet.com'
).replace(/\/$/, '');

export const dynamic = 'force-dynamic';

const STATIC_PAGES: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
}> = [
  { path: '/',                 priority: 1.0, changeFrequency: 'daily' },
  { path: '/shop',             priority: 0.9, changeFrequency: 'daily' },
  { path: '/brand',            priority: 0.7, changeFrequency: 'weekly' },
  { path: '/blog',             priority: 0.6, changeFrequency: 'weekly' },
  { path: '/contact',          priority: 0.4, changeFrequency: 'monthly' },
  { path: '/for-business',     priority: 0.7, changeFrequency: 'monthly' },
  { path: '/privacy',          priority: 0.2, changeFrequency: 'yearly' },
  { path: '/terms',            priority: 0.2, changeFrequency: 'yearly' },
  { path: '/shipping-policy',  priority: 0.3, changeFrequency: 'yearly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createStaticClient();
  const now = new Date();

  const [categoriesRes, brandsRes, productsRes] = await Promise.all([
    supabase
      .from('categories')
      .select('slug, updated_at')
      .eq('is_active', true)
      .is('parent_id', null),
    supabase
      .from('brands')
      .select('slug, updated_at')
      .eq('is_active', true),
    (async () => {
      // Page through products — there are ~600+ active SKUs, just under the
      // default 1000-row limit, but page anyway in case the catalog grows.
      const all: Array<{ slug: string; updated_at: string }> = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data } = await supabase
          .from('products')
          .select('slug, updated_at')
          .eq('is_active', true)
          .is('deleted_at', null)
          .range(from, from + pageSize - 1);
        const rows = data ?? [];
        all.push(...rows);
        if (rows.length < pageSize) break;
      }
      return { data: all };
    })(),
  ]);

  const entries: MetadataRoute.Sitemap = [];

  for (const p of STATIC_PAGES) {
    entries.push({
      url: `${SITE}${p.path}`,
      lastModified: now,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
    });
  }

  for (const c of categoriesRes.data ?? []) {
    entries.push({
      url: `${SITE}/shop/${c.slug}`,
      lastModified: c.updated_at ? new Date(c.updated_at) : now,
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

  for (const b of brandsRes.data ?? []) {
    entries.push({
      url: `${SITE}/brand/${b.slug}`,
      lastModified: b.updated_at ? new Date(b.updated_at) : now,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  for (const p of productsRes.data ?? []) {
    entries.push({
      url: `${SITE}/product/${p.slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }

  return entries;
}
