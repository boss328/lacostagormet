import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

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

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const search = typeof searchParams.q === 'string' ? searchParams.q : undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();
  let q = admin
    .from('customers')
    .select('id, email, first_name, last_name, company_name, migrated_from_bc, created_at', {
      count: 'exact',
    });
  if (search) {
    q = q.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  }
  q = q.order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1);

  const { data, count } = await q;
  const rows = (data ?? []) as CustomerRow[];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <header className="mb-8">
        <p className="type-label text-accent mb-3">§ Customers</p>
        <h1 className="type-display-2">Customer list.</h1>
        <p className="type-data-mono text-ink-muted mt-3">
          {total.toLocaleString()} {total === 1 ? 'customer' : 'customers'} on file
        </p>
      </header>

      <form method="GET" action="/admin/customers" className="flex items-center gap-4 mb-6 flex-wrap">
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
            minHeight: 44,
          }}
        />
        <button type="submit" className="btn btn-solid" style={{ padding: '12px 22px' }}>
          <span>Search</span>
          <span className="btn-arrow" aria-hidden="true">→</span>
        </button>
        {search && (
          <Link
            href="/admin/customers"
            className="type-label text-ink-muted hover:text-accent transition-colors duration-200"
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div
          className="bg-paper-2 text-center px-10 py-16"
          style={{ border: '1px solid var(--rule)' }}
        >
          <p
            className="font-display italic text-brand-deep"
            style={{ fontSize: '22px', letterSpacing: '-0.02em' }}
          >
            No customers match.
          </p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--rule)', background: 'var(--color-cream)' }}>
          <div
            className="grid items-center gap-4 px-4 py-3 bg-paper-2"
            style={{
              gridTemplateColumns: 'minmax(260px,1.2fr) minmax(160px,1fr) minmax(160px,1fr) auto auto',
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
              href={`/admin/customers/${c.id}`}
              className="grid items-center gap-4 px-4 py-3 hover:bg-paper-2 transition-colors duration-200"
              style={{
                gridTemplateColumns: 'minmax(260px,1.2fr) minmax(160px,1fr) minmax(160px,1fr) auto auto',
                borderBottom: '1px solid var(--rule)',
                minHeight: 48,
              }}
            >
              <span className="font-display text-ink truncate">{c.email}</span>
              <span className="font-display text-ink truncate">
                {[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
              </span>
              <span className="font-display text-ink-muted truncate">
                {c.company_name || '—'}
              </span>
              <span className="type-data-mono text-ink-muted">
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
              href={`/admin/customers?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(page > 2 ? { page: String(page - 1) } : {}) }).toString()}`}
              className="type-label text-ink hover:text-brand-deep transition-colors duration-200"
            >
              ←&nbsp;Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="type-data-mono text-ink-muted">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={`/admin/customers?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(page + 1) }).toString()}`}
              className="type-label text-ink hover:text-brand-deep transition-colors duration-200"
            >
              Older&nbsp;→
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  );
}
