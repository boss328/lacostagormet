import Link from 'next/link';

export const metadata = { title: 'Imports' };

/**
 * CSV imports landing — 5 import types as editorial cards.
 *
 * Execution-side wizards (upload → map → preview → dry-run → execute)
 * are scoped for Phase 7. V1 ships a CLI-equivalent path via the scripts
 * under /scripts/ (migrate-products, migrate-customers, migrate-orders)
 * — those handle the launch-day bulk imports. The admin UI becomes the
 * ongoing-ops surface once Phase 7 wires execute + rollback + audit.
 */

type ImportType = {
  slug: string;
  numeral: string;
  title: string;
  subtitle: string;
  matchOn: string;
  script: string;
  status: 'available' | 'phase-7';
};

const IMPORTS: ImportType[] = [
  {
    slug: 'products',
    numeral: 'I',
    title: 'Product catalog',
    subtitle: 'Add, update, or deactivate SKUs. Matches on sku.',
    matchOn: 'products.sku',
    script: 'scripts/migrate-products.ts',
    status: 'phase-7',
  },
  {
    slug: 'customers',
    numeral: 'II',
    title: 'Customer list',
    subtitle: 'Bulk-add customers, merge duplicates, flag BC migrations.',
    matchOn: 'customers.email',
    script: 'scripts/migrate-customers.ts',
    status: 'phase-7',
  },
  {
    slug: 'orders',
    numeral: 'III',
    title: 'Order history',
    subtitle: 'Historical orders from other systems. Flexible column mapping.',
    matchOn: 'orders.order_number',
    script: 'scripts/migrate-orders.ts',
    status: 'phase-7',
  },
  {
    slug: 'inventory',
    numeral: 'IV',
    title: 'Inventory levels',
    subtitle: 'SKU + stock count. Bulk stock updates. Phase 7 adds a stock column.',
    matchOn: 'products.sku',
    script: '(coming with Phase 7 inventory schema)',
    status: 'phase-7',
  },
  {
    slug: 'vendor-pricing',
    numeral: 'V',
    title: 'Vendor pricing sheets',
    subtitle: 'SKU + wholesale cost + effective date. Tracks history per vendor.',
    matchOn: 'products.sku',
    script: '(coming Phase 7)',
    status: 'phase-7',
  },
];

export default function AdminImportsPage() {
  return (
    <>
      <header className="mb-8">
        <p className="type-label text-accent mb-3">§ Imports — data staging</p>
        <h1
          className="font-display text-ink"
          style={{ fontSize: '36px', lineHeight: 1, letterSpacing: '-0.025em' }}
        >
          Bring data <em className="type-accent">in</em>.
        </h1>
        <p
          className="type-body mt-4 max-w-[620px]"
          style={{ fontSize: '15.5px', lineHeight: 1.55 }}
        >
          Five import pipelines, one wizard shape: upload → map columns →
          preview → dry-run → execute. The launch-day migrations (121 products,
          6,335 customers, 3,141 orders) already landed via the tsx scripts
          under{' '}
          <span className="type-data-mono text-ink">scripts/</span>. Web UI
          execution arrives with Phase 7 so Jeff can run these without touching
          a terminal.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {IMPORTS.map((i) => (
          <Link
            key={i.slug}
            href={`/admin/imports/${i.slug}`}
            className="bg-cream flex flex-col gap-3 transition-colors duration-200 hover:bg-paper-2"
            style={{
              border: '1px solid var(--rule-strong)',
              padding: '22px 26px',
              minHeight: 160,
            }}
          >
            <div className="flex items-baseline gap-3">
              <span
                className="font-display italic text-brand-deep shrink-0"
                style={{
                  fontSize: '22px',
                  lineHeight: 1,
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  width: 26,
                }}
              >
                {i.numeral}
              </span>
              <h2
                className="font-display text-ink flex-1"
                style={{
                  fontSize: '22px',
                  lineHeight: 1.15,
                  letterSpacing: '-0.018em',
                }}
              >
                {i.title}
              </h2>
              {i.status === 'phase-7' && (
                <span
                  className="type-label-sm text-cream shrink-0"
                  style={{ padding: '3px 8px', background: 'var(--color-gold)' }}
                >
                  Phase 7
                </span>
              )}
            </div>
            <p
              className="font-display text-ink-2 flex-1"
              style={{ fontSize: '14.5px', lineHeight: 1.55 }}
            >
              {i.subtitle}
            </p>
            <div
              className="flex items-center justify-between pt-3 mt-auto"
              style={{ borderTop: '1px dashed var(--rule)' }}
            >
              <span className="type-data-mono text-ink-muted">
                Match · {i.matchOn}
              </span>
              <span className="type-data-mono text-ink-muted">{i.script}</span>
            </div>
          </Link>
        ))}
      </div>

      <p className="type-data-mono text-ink-muted mt-10 max-w-[620px]">
        For the launch run, use the tsx scripts directly:{' '}
        <span className="text-ink">pnpm tsx scripts/migrate-customers.ts --dry-run</span> →
        review → run without the flag. All scripts are idempotent and have the
        same 1% error-rate safety gate.
      </p>
    </>
  );
}
