import Link from 'next/link';
import { notFound } from 'next/navigation';

export const metadata = { title: 'Import wizard' };

const KNOWN: Record<string, { title: string; script: string }> = {
  products:       { title: 'Product catalog',      script: 'scripts/migrate-products.ts' },
  customers:      { title: 'Customer list',        script: 'scripts/migrate-customers.ts' },
  orders:         { title: 'Order history',        script: 'scripts/migrate-orders.ts' },
  inventory:      { title: 'Inventory levels',     script: '(pending Phase 7 inventory schema)' },
  'vendor-pricing': { title: 'Vendor pricing sheets', script: '(pending Phase 7)' },
};

export default function ImportWizardStub({ params }: { params: { slug: string } }) {
  const cfg = KNOWN[params.slug];
  if (!cfg) notFound();

  return (
    <>
      <Link
        href="/admin/imports/"
        className="type-label-sm text-ink-muted hover:text-brand-deep transition-colors duration-200 inline-block mb-5"
      >
        ← All imports
      </Link>

      <header className="mb-8">
        <p className="type-label text-accent mb-3">§ Import wizard</p>
        <h1
          className="font-display text-ink"
          style={{ fontSize: '36px', lineHeight: 1, letterSpacing: '-0.025em' }}
        >
          {cfg.title} <em className="type-accent">import</em>.
        </h1>
      </header>

      <section
        className="bg-cream mb-6"
        style={{ border: '1px solid var(--rule-strong)', padding: '28px 30px' }}
      >
        <p className="type-label text-ink mb-4">§&nbsp;&nbsp;Status — coming Phase 7</p>
        <p
          className="font-display text-ink-2 mb-5"
          style={{ fontSize: '16px', lineHeight: 1.55 }}
        >
          The in-browser wizard (upload → map → preview → dry-run → execute
          with rollback) lands in Phase 7. For the launch-day migration use
          the CLI script — same logic, same 1% error-rate safety gate, same
          idempotent upsert-by-primary-key semantics.
        </p>

        <div
          className="grid gap-4 lg:grid-cols-[auto_1fr] mb-6"
          style={{ padding: '16px 18px', background: 'var(--color-paper-2)', border: '1px solid var(--rule)' }}
        >
          <span className="type-label-sm text-ink-muted">Script</span>
          <code className="font-mono text-ink" style={{ fontSize: '13.5px' }}>
            {cfg.script}
          </code>
          <span className="type-label-sm text-ink-muted">Dry run</span>
          <code className="font-mono text-ink-muted" style={{ fontSize: '13px' }}>
            pnpm tsx {cfg.script} --dry-run
          </code>
          <span className="type-label-sm text-ink-muted">Real run</span>
          <code className="font-mono text-ink-muted" style={{ fontSize: '13px' }}>
            pnpm tsx {cfg.script}
          </code>
        </div>

        <p className="type-data-mono text-ink-muted">
          Scripts live in <span className="text-ink">scripts/</span> and read
          from <span className="text-ink">lcg-spec/references/bigcommerce/</span>
          by default.
        </p>
      </section>

      <section
        className="bg-paper-2"
        style={{ border: '1px solid var(--rule)', padding: '22px 26px' }}
      >
        <p className="type-label text-ink mb-3">§&nbsp;&nbsp;Phase 7 wizard steps (planned)</p>
        <ol
          className="flex flex-col"
          style={{ borderTop: '1px solid var(--rule)' }}
        >
          {[
            '1. Upload CSV — drop a file, auto-detect headers.',
            '2. Map columns — link CSV headers to internal fields. Remember mapping per import type.',
            '3. Preview — first 10 rows with red highlights on validation errors.',
            '4. Dry run — shows what would change (green NEW, yellow UPDATED, red DELETED).',
            '5. Execute — progress bar + final summary + audit-log entry.',
          ].map((t) => (
            <li
              key={t}
              className="py-2"
              style={{ borderBottom: '1px dashed var(--rule)' }}
            >
              <span className="font-display text-ink-2" style={{ fontSize: '14.5px' }}>
                {t}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
