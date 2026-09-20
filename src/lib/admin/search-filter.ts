/** Literal case-insensitive search; quote OR values and escape regex syntax. */
export function searchFilter(
  columns: readonly string[],
  query: string,
): string {
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = JSON.stringify(escaped);
  return columns.map((column) => `${column}.imatch.${pattern}`).join(',');
}
