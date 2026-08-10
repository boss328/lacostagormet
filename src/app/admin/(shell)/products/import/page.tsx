import { ImportProductsCsv } from '@/components/admin/ImportProductsCsv';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Import Products',
};

/**
 * /admin/products/import — bulk product update from an edited copy of the
 * full-field CSV export. Two-phase: preview (no writes) → confirm.
 */
export default function ImportProductsPage() {
  return (
    <>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ IV.b Bulk import</p>
        <h1
          className="font-display text-ink max-md:!text-[24px]"
          style={{ fontSize: '40px', lineHeight: 1, letterSpacing: '-0.026em', fontWeight: 400 }}
        >
          Import the <em className="type-accent">catalog</em>.
        </h1>
        <p className="type-data-mono text-ink-muted mt-3 max-w-[720px]">
          Start from Export CSV on the products page, edit in a spreadsheet, upload
          here. Rows match by SKU and only update existing products — nothing is ever
          created. Empty cells mean “no change”; type CLEAR to empty a field. Brand and
          category must match existing names exactly. The slug, id, image and timestamp
          columns are ignored (slug edits go through the product form — changing slugs
          breaks live Google URLs). Nothing is written until you confirm the preview,
          and one bad row blocks the whole file.
        </p>
      </header>

      <ImportProductsCsv />
    </>
  );
}
