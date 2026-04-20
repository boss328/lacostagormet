import Link from 'next/link';
import { ProductCard } from '@/components/shop/ProductCard';
import { isJustIn, type ProductWithJustIn, PAGE_SIZE } from '@/lib/catalog-query';

type ProductGridProps = {
  products: ProductWithJustIn[];
  total: number;
  page: number;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  justInThreshold: string | null;
  resetHref?: string;
};

function firstStr(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function buildHref(
  basePath: string,
  sp: Record<string, string | string[] | undefined>,
  overrides: Record<string, string | undefined>,
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...overrides })) {
    const value = firstStr(v as string | string[] | undefined);
    if (value) qs.set(k, value);
  }
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export function ProductGrid({
  products,
  total,
  page,
  basePath,
  searchParams,
  justInThreshold,
  resetHref,
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div
        className="bg-paper-2 text-center px-8 py-16 max-sm:px-5"
        style={{ border: '1px solid var(--rule)' }}
      >
        <p
          className="font-display italic text-brand-deep mb-5"
          style={{ fontSize: '24px', letterSpacing: '-0.02em' }}
        >
          No products match those filters.
        </p>
        {resetHref && (
          <Link
            href={resetHref}
            className="type-label text-ink hover:text-brand-deep transition-colors duration-200 inline-block"
          >
            Clear filters&nbsp;→
          </Link>
        )}
      </div>
    );
  }

  const showing = products.length;
  const hasMore = showing < total;
  const nextHref = buildHref(basePath, searchParams, { page: String(page + 1) });
  const remaining = total - showing;
  const nextBatch = Math.min(remaining, PAGE_SIZE);

  return (
    <>
      <div className="grid gap-x-6 gap-y-10 max-lg:grid-cols-2 max-md:gap-x-3 max-md:gap-y-5 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            showJustIn={isJustIn(p, justInThreshold)}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-16 max-sm:pt-12">
          <Link
            href={nextHref}
            scroll={false}
            className="btn btn-outline"
          >
            <span>
              Load {nextBatch} more
            </span>
            <span className="btn-arrow" aria-hidden="true">↓</span>
          </Link>
        </div>
      )}
    </>
  );
}
