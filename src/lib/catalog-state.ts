export type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name-asc';
export const PAGE_SIZE = 24;
export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name-asc', label: 'Name: A to Z' },
];
export function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
export function parsePage(raw: string | string[] | undefined) {
  const value = firstValue(raw) ?? '1';
  const page = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(page) && page > 0
    ? Math.min(page, 100000)
    : 1;
}
export function parseSort(raw: string | string[] | undefined): SortKey {
  return (
    SORT_OPTIONS.find((option) => option.value === firstValue(raw))?.value ??
    'newest'
  );
}
export function catalogHref(
  path: string,
  params: Record<string, string | string[] | undefined>,
  overrides: Record<string, string | undefined> = {},
) {
  const query = new URLSearchParams();
  for (const key of ['q', 'brand', 'category', 'sort', 'page']) {
    const value = firstValue({ ...params, ...overrides }[key]);
    if (value) query.set(key, value);
  }
  return query.size ? `${path}?${query}` : path;
}
