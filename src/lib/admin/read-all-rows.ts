/** Exports must page past the Data API row cap instead of silently truncating. */
export async function readAllRows<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const data: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await query(from, from + 499);
    if (result.error) return { data: null, error: result.error };
    const rows = result.data ?? [];
    data.push(...rows);
    if (rows.length < 500) return { data, error: null };
  }
}
