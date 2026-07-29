import { parsePage } from '@/lib/catalog-query';

/**
 * Canonical URL for paginated listing pages (/shop, /shop/[cat], /brand/[b]).
 *
 * Self-referencing per Google's pagination guidance: page 2+ keeps its
 * ?page=N (canonicalizing deep pages to page 1 is treated as an error and
 * often ignored). Everything else — brand/category filters, sort, and
 * tracking params like Merchant Center's srsltid — is stripped, so filter
 * permutations and tagged URLs consolidate onto the clean listing URL.
 *
 * Trailing slash is explicit because next.config sets `trailingSlash: true`
 * but Next does NOT apply it to `alternates.canonical`; without it the
 * canonical would point at a 308 redirect.
 */
export function listingCanonical(
  basePath: string,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const page = parsePage(searchParams.page);
  return page > 1 ? `${basePath}/?page=${page}` : `${basePath}/`;
}
