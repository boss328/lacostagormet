import Link from 'next/link';
import { ProductCard } from './ProductCard';
import { type ProductWithJustIn } from '@/lib/catalog-query';
import { catalogHref, PAGE_SIZE } from '@/lib/catalog-state';
export function ProductGrid({
  products,
  total,
  page,
  basePath,
  searchParams,
  resetHref,
}: {
  products: ProductWithJustIn[];
  total: number;
  page: number;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  justInThreshold: string | null;
  resetHref?: string;
}) {
  if (!products.length)
    return (
      <div className="empty-state">
        <h2>No products found.</h2>
        <p>Try another search or remove a filter to see more options.</p>
        <Link className="btn btn-outline" href={resetHref ?? '/shop'}>
          Clear filters
        </Link>
      </div>
    );
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <>
      <div className="product-grid">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} compact />
        ))}
      </div>
      {pageCount > 1 && (
        <nav className="catalog-pagination" aria-label="Product pages">
          {page > 1 ? (
            <Link
              className="btn btn-outline"
              href={catalogHref(basePath, searchParams, {
                page: String(page - 1),
              })}
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              className="btn btn-outline"
              href={catalogHref(basePath, searchParams, {
                page: String(page + 1),
              })}
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
