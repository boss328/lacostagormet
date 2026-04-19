import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseRange, resolveRange, fmtDelta } from '@/lib/admin/range';
import { loadCustomersSection } from '@/lib/admin/section-analytics';
import { SectionAnalytics, HeadlineStat } from '@/components/admin/section/SectionAnalytics';
import { CustomersCharts } from '@/components/admin/section/LazyCharts';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type CustomerRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  migrated_from_bc: boolean;
  created_at: string;
};

function buildHref(base: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const search = typeof searchParams.q === 'string' ? searchParams.q : undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const rangeKey = parseRange(searchParams.range);
  const range = resolveRange(rangeKey);

  const admin = createAdminClient();

  const [{ data, count }, section] = await Promise.all([
    (async () => {
      let q = admin
        .from('customers')
        .select(
          'id, email, first_name, last_name, company_name, migrated_from_bc, created_at',
          { count: 'exact' },
        );
      if (search) {
        q = q.or(
          `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`,
        );
      }
      q = q.order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
      return q;
    })(),
    loadCustomersSection(range),
  ]);

  const rows = (data ?? []) as CustomerRow[];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const newDelta = fmtDelta(section.headline.newCount, section.headline.priorNewCount);
  const top10Total = section.topSpenders.reduce((s, r) => s + r.total, 0);
  const fmtMoneyShort = (n: number) =>
    `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ III. Customers</p>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h1
            className="font-display text-ink"
            style={{ fontSize: '40px', lineHeight: 1, letterSpacing: '-0.026em', fontWeight: 400 }}
          >
            The <em className="type-accent">rolodex</em>.
          </h1>
          <div className="flex items-center gap-5">
            <Link
              href={buildHref('/api/admin/customers/export', { q: search })}
              className="type-label-sm text-ink hover:text-brand-deep transition-colors duration-200"
            >
              Export CSV →
            </Link>
            <span className="type-data-mono text-ink-muted">
              {total.toLocaleString()} on file
            </span>
          </div>
        </div>
      </header>

      <SectionAnalytics
        range={rangeKey}
        eyebrow="Customers Analytics"
        headline={
          <div className="grid gap-6 lg:grid-cols-4 max-sm:grid-cols-2">
            <HeadlineStat
              label={`New customers — ${range.short}`}
              value={section.headline.newCount.toLocaleString()}
              delta={newDelta.pct === null ? null : { label: newDelta.label, sign: newDelta.sign }}
              sub="vs prior"
            />
            <HeadlineStat
              label="Total on file"
              value={section.headline.totalCount.toLocaleString()}
              sub="lifetime"
            />
            <HeadlineStat
              label="Top-10 spend (lifetime)"
              value={fmtMoneyShort(top10Total)}
              sub="combined"
            />
            <HeadlineStat
              label="$1k+ LTV"
              value={(
                (section.ltvBuckets.find((b) => b.label === '$1k–5k')?.count ?? 0) +
                (section.ltvBuckets.find((b) => b.label === '$5k+')?.count ?? 0)
              ).toLocaleString()}
              sub="customers"
            />
          </div>
        }
        charts={
          <CustomersCharts
            acquisition={section.acquisition}
            ltvBuckets={section.ltvBuckets}
            topSpenders={section.topSpenders}
          />
        }
      />

      <form
        method="GET"
        action="/admin/customers/"
        className="flex items-center gap-3 mb-6 flex-wrap"
      >
        {rangeKey !== 'all' && <input type="hidden" name="range" value={rangeKey} />}
        <input
          type="search"
          name="q"
          placeholder="Email, first name, or last name"
          defaultValue={search ?? ''}
          className="bg-cream text-ink font-display flex-1 min-w-[240px]"
          style={{
            border: '1px solid var(--rule-strong)',
            padding: '10px 14px',
            fontSize: '14px',
            minHeight: 40,
          }}
        />
        <button
          type="submit"
          className="type-label-sm text-ink"
          style={{
            padding: '10px 18px',
            border: '1px solid var(--color-ink)',
            background: 'var(--color-cream)',
          }}
        >
          Search
        </button>
        {search && (
          <Link
            href={buildHref('/admin/customers/', {
              range: rangeKey === 'all' ? undefined : rangeKey,
            })}
            className="type-label-sm text-ink-muted hover:text-accent"
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div
          className="bg-paper-2 text-center px-10 py-20"
          style={{ border: '1px solid var(--rule)' }}
        >
          <p
            className="font-display italic text-brand-deep"
            style={{ fontSize: '24px', letterSpacing: '-0.02em' }}
          >
            No customers match.
          </p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--rule)', background: 'var(--color-cream)' }}>
          <div
            className="grid items-center gap-4 px-5 py-4 bg-paper-2"
            style={{
              gridTemplateColumns:
                'minmax(260px,1.2fr) minmax(160px,1fr) minmax(160px,1fr) auto auto',
              borderBottom: '1px solid var(--rule-strong)',
            }}
          >
            <span className="type-label-sm text-ink">Email</span>
            <span className="type-label-sm text-ink">Name</span>
            <span className="type-label-sm text-ink">Company</span>
            <span className="type-label-sm text-ink">Source</span>
            <span className="type-label-sm text-ink">Added</span>
          </div>
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/admin/customers/${c.id}/`}
              className="grid items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-cream"
              style={{
                gridTemplateColumns:
                  'minmax(260px,1.2fr) minmax(160px,1fr) minmax(160px,1fr) auto auto',
                borderBottom: '1px solid var(--rule)',
                minHeight: 56,
              }}
            >
              <span className="font-display text-ink truncate">{c.email}</span>
              <span className="font-display text-ink truncate">
                {[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
              </span>
              <span className="font-display text-ink-muted truncate">
                {c.company_name || '—'}
              </span>
              <span
                className="type-label-sm"
                style={{
                  padding: '3px 8px',
                  background: c.migrated_from_bc ? 'var(--color-gold)' : 'var(--color-forest)',
                  color: 'var(--color-cream)',
                }}
              >
                {c.migrated_from_bc ? 'BC' : 'new'}
              </span>
              <span className="type-data-mono text-ink-muted">
                {new Date(c.created_at).toLocaleDateString('en-US')}
              </span>
            </Link>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between pt-6">
          {page > 1 ? (
            <Link
              href={buildHref('/admin/customers/', {
                q: search,
                range: rangeKey === 'all' ? undefined : rangeKey,
                page: page > 2 ? String(page - 1) : undefined,
              })}
              className="type-label-sm text-ink hover:text-brand-deep"
            >
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="type-data-mono text-ink-muted">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={buildHref('/admin/customers/', {
                q: search,
                range: rangeKey === 'all' ? undefined : rangeKey,
                page: String(page + 1),
              })}
              className="type-label-sm text-ink hover:text-brand-deep"
            >
              Older →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  );
}
