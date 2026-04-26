/**
 * Convert an arbitrary string into a URL-safe slug.
 * Used by the product creation form to default `slug` from `name`.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/['"`]/g, '') // drop quotes wholesale
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
