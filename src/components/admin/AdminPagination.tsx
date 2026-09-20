import Link from 'next/link';
export function AdminPagination({
  path,
  page,
  total,
  params,
}: {
  path: string;
  page: number;
  total: number;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / 50));
  const href = (next: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      if (value) query.set(key, value);
    query.set('page', String(next));
    return `${path}?${query}`;
  };
  if (pages === 1 && page === 1) return null;
  return (
    <nav className="catalog-pagination" aria-label="Record pages">
      {page > 1 ? (
        <Link
          className="btn btn-outline"
          href={href(Math.min(page - 1, pages))}
        >
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span>
        {page > pages ? 'No records on this page' : `Page ${page} of ${pages}`}
      </span>
      {page < pages ? (
        <Link className="btn btn-outline" href={href(page + 1)}>
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
