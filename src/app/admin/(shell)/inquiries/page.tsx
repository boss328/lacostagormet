import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { InquiryRowActions } from '@/components/admin/inquiries/InquiryRowActions';

export const dynamic = 'force-dynamic';

type Status = 'new' | 'contacted' | 'archived';
type StatusFilter = Status | 'all';

type InquiryRow = {
  id: string;
  name: string;
  business_name: string;
  email: string;
  phone: string | null;
  volume_estimate: string | null;
  notes: string | null;
  status: Status;
  created_at: string;
};

const STATUSES: Array<{ key: StatusFilter; label: string }> = [
  { key: 'new',       label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'archived',  label: 'Archived' },
  { key: 'all',       label: 'All' },
];

const STATUS_COLOR: Record<Status, string> = {
  new:       'var(--color-brand-deep)',
  contacted: 'var(--color-gold)',
  archived:  'var(--color-ink-muted)',
};

const VOLUME_LABELS: Record<string, string> = {
  'under-500': 'Under $500/mo',
  '500-2k':    '$500 – $2k/mo',
  '2k-5k':     '$2k – $5k/mo',
  '5k-plus':   '$5k+/mo',
};

function buildHref(base: string, params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const statusKey = (
    typeof searchParams.status === 'string' ? searchParams.status : 'new'
  ) as StatusFilter;

  const admin = createAdminClient();
  let q = admin
    .from('inquiries')
    .select(
      'id, name, business_name, email, phone, volume_estimate, notes, status, created_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (statusKey !== 'all') q = q.eq('status', statusKey);

  const { data, count } = await q;
  const rows = (data ?? []) as InquiryRow[];

  return (
    <>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ VII. Inquiries</p>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h1
            className="font-display text-ink max-md:!text-[24px]"
            style={{ fontSize: '40px', lineHeight: 1, letterSpacing: '-0.026em', fontWeight: 400 }}
          >
            The <em className="type-accent">inbox</em>.
          </h1>
          <span className="type-data-mono text-ink-muted">
            {(count ?? 0).toLocaleString()} on this view
          </span>
        </div>
      </header>

      <div className="flex items-center gap-1.5 mb-6 flex-wrap">
        {STATUSES.map((s) => {
          const active = s.key === statusKey;
          return (
            <Link
              key={s.key}
              href={buildHref('/admin/inquiries/', {
                status: s.key === 'new' ? undefined : s.key,
              })}
              className="type-label-sm transition-colors duration-200"
              style={{
                padding: '6px 11px',
                border: '1px solid',
                borderColor: active ? 'var(--color-ink)' : 'var(--rule-strong)',
                background: active ? 'var(--color-ink)' : 'transparent',
                color: active ? 'var(--color-cream)' : 'var(--color-ink-2)',
              }}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div
          className="bg-paper-2 text-center px-10 py-20"
          style={{ border: '1px solid var(--rule)' }}
        >
          <p
            className="font-display italic text-brand-deep"
            style={{ fontSize: '24px', letterSpacing: '-0.02em' }}
          >
            {statusKey === 'new' ? 'No new inquiries waiting on you.' : 'No inquiries in this view.'}
          </p>
          <p className="type-data-mono text-ink-muted mt-3">
            New /for-business form submissions land here.
          </p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--rule)', background: 'var(--color-cream)' }}>
          {rows.map((r) => (
            <article
              key={r.id}
              className="px-5 py-5"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <div className="flex items-baseline justify-between gap-6 flex-wrap mb-3">
                <div className="min-w-0">
                  <p
                    className="font-display italic text-brand-deep"
                    style={{ fontSize: '20px', fontWeight: 500, letterSpacing: '-0.018em', lineHeight: 1.1 }}
                  >
                    {r.business_name}
                  </p>
                  <p className="type-data-mono text-ink-muted mt-1">
                    {r.name} · <a href={`mailto:${r.email}`} className="hover:text-brand-deep">{r.email}</a>
                    {r.phone && (
                      <>
                        {' · '}
                        <a href={`tel:${r.phone}`} className="hover:text-brand-deep">{r.phone}</a>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="type-label-sm text-cream"
                    style={{ padding: '4px 10px', background: STATUS_COLOR[r.status] }}
                  >
                    {r.status}
                  </span>
                  <span className="type-data-mono text-ink-muted">
                    {new Date(r.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[auto_1fr_auto] items-start mt-3">
                <p className="type-data-mono text-ink">
                  {r.volume_estimate
                    ? VOLUME_LABELS[r.volume_estimate] ?? r.volume_estimate
                    : '(no estimate)'}
                </p>
                <p
                  className="font-display text-ink"
                  style={{ fontSize: '14.5px', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}
                >
                  {r.notes?.trim() || <span className="text-ink-muted italic">(no notes)</span>}
                </p>
                <InquiryRowActions id={r.id} status={r.status} />
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
