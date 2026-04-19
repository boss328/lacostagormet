import { createClient } from '@/lib/supabase/server';
import { FilterSelect, type SelectOption } from '@/components/shop/FilterSelect';
import { SORT_OPTIONS, type SortKey } from '@/lib/catalog-query';

type FilterBarProps = {
  total: number;
  showing: number;
  currentBrand?: string;
  currentCategory?: string;
  currentSort: SortKey;
  hideCategory?: boolean;
  hideBrand?: boolean;
};

export async function FilterBar({
  total,
  showing,
  currentBrand,
  currentCategory,
  currentSort,
  hideCategory = false,
  hideBrand = false,
}: FilterBarProps) {
  const supabase = createClient();

  const [brandsRes, categoriesRes] = await Promise.all([
    hideBrand
      ? Promise.resolve({ data: [] as Array<{ slug: string; name: string }> })
      : supabase.from('brands').select('slug, name').eq('is_active', true).order('name'),
    hideCategory
      ? Promise.resolve({ data: [] as Array<{ slug: string; name: string }> })
      : supabase
          .from('categories')
          .select('slug, name, display_order')
          .is('parent_id', null)
          .eq('is_active', true)
          .order('display_order'),
  ]);

  const brandOptions: SelectOption[] = (brandsRes.data ?? []).map((b) => ({
    value: b.slug,
    label: b.name,
  }));
  const categoryOptions: SelectOption[] = (categoriesRes.data ?? []).map((c) => ({
    value: c.slug,
    label: c.name,
  }));

  const sortOptions: SelectOption[] = SORT_OPTIONS.map((s) => ({
    value: s.value,
    label: s.label,
  }));

  return (
    <div
      className="sticky top-0 z-20 bg-paper"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <div className="max-w-content mx-auto px-8 py-4 flex items-center gap-6 flex-wrap max-sm:px-5 max-sm:gap-4">
        <span className="type-label text-ink-muted shrink-0">Filter by</span>

        <div className="flex items-center gap-5 flex-wrap flex-1 min-w-0">
          {!hideBrand && (
            <FilterSelect
              name="brand"
              options={brandOptions}
              currentValue={currentBrand}
              placeholderLabel="All brands"
              ariaLabel="Filter by brand"
            />
          )}

          {!hideCategory && (
            <FilterSelect
              name="category"
              options={categoryOptions}
              currentValue={currentCategory}
              placeholderLabel="All categories"
              ariaLabel="Filter by category"
            />
          )}

          <FilterSelect
            name="sort"
            options={sortOptions}
            currentValue={currentSort === 'newest' ? undefined : currentSort}
            placeholderLabel="Newest first"
            ariaLabel="Sort order"
          />
        </div>

        <span className="type-data-mono text-ink-muted shrink-0 whitespace-nowrap">
          {total === 0
            ? 'No products'
            : showing < total
              ? `${showing} of ${total}`
              : `${total} ${total === 1 ? 'product' : 'products'}`}
        </span>
      </div>
    </div>
  );
}
