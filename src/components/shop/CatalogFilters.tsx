'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { SORT_OPTIONS, catalogHref } from '@/lib/catalog-state';
import type { CatalogFilters as Filters } from '@/lib/catalog-filter';

type Option = { value: string; label: string };
export function CatalogFilters({
  path,
  filters,
  brands,
  categories,
  hideBrand,
  hideCategory,
  total,
}: {
  path: string;
  filters: Filters;
  brands: Option[];
  categories: Option[];
  hideBrand: boolean;
  hideCategory: boolean;
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({
    q: filters.q ?? '',
    brand: hideBrand ? '' : (filters.brand ?? ''),
    category: hideCategory ? '' : (filters.category ?? ''),
    sort: filters.sort ?? 'newest',
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(() =>
      router.push(catalogHref(path, { ...values, q: values.q.trim() }), {
        scroll: false,
      }),
    );
  }
  const applied = [
    ...(!hideBrand && filters.brand
      ? [
          {
            key: 'brand',
            label:
              brands.find((b) => b.value === filters.brand)?.label ??
              filters.brand,
          },
        ]
      : []),
    ...(!hideCategory && filters.category
      ? [
          {
            key: 'category',
            label:
              categories.find((c) => c.value === filters.category)?.label ??
              filters.category,
          },
        ]
      : []),
    ...(filters.q ? [{ key: 'q', label: `“${filters.q}”` }] : []),
  ];
  const current = {
    q: filters.q,
    brand: hideBrand ? undefined : filters.brand,
    category: hideCategory ? undefined : filters.category,
    sort: filters.sort,
  };
  return (
    <div className="catalog-toolbar">
      <div className="wrap">
        <form
          onSubmit={submit}
          action={path}
          method="get"
          aria-label="Filter products"
        >
          <fieldset disabled={pending} className="filter-controls">
            <label className="catalog-search">
              <span className="sr-only">Search products</span>
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                name="q"
                placeholder="Search products or brands"
                value={values.q}
                onChange={(e) => setValues({ ...values, q: e.target.value })}
              />
            </label>
            {!hideCategory && (
              <label>
                <span>Category</span>
                <select
                  name="category"
                  value={values.category}
                  onChange={(e) =>
                    setValues({ ...values, category: e.target.value })
                  }
                >
                  <option value="">All categories</option>
                  {values.category &&
                    !categories.some((c) => c.value === values.category) && (
                      <option value={values.category}>Unknown category</option>
                    )}
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!hideBrand && (
              <label>
                <span>Brand</span>
                <select
                  name="brand"
                  value={values.brand}
                  onChange={(e) =>
                    setValues({ ...values, brand: e.target.value })
                  }
                >
                  <option value="">All brands</option>
                  {values.brand &&
                    !brands.some((b) => b.value === values.brand) && (
                      <option value={values.brand}>Unknown brand</option>
                    )}
                  {brands.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span>Sort</span>
              <select
                name="sort"
                value={values.sort}
                onChange={(e) =>
                  setValues({
                    ...values,
                    sort: e.target.value as typeof values.sort,
                  })
                }
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-solid" type="submit">
              {pending ? 'Updating…' : 'Apply filters'}
            </button>
          </fieldset>
        </form>
        <div className="filter-summary" aria-live="polite" aria-busy={pending}>
          <p>
            {total} {total === 1 ? 'product' : 'products'}
          </p>
          {applied.map((chip) => (
            <Link
              key={chip.key}
              className="filter-chip"
              href={catalogHref(path, current, { [chip.key]: undefined })}
              scroll={false}
              aria-label={`Remove ${chip.label} filter`}
            >
              {chip.label}
              <X size={12} aria-hidden="true" />
            </Link>
          ))}
          {(applied.length > 0 || filters.sort !== 'newest') && (
            <Link className="text-link" href={path} scroll={false}>
              Clear all
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
