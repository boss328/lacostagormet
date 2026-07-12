import Link from 'next/link';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  name: 'Category name is required.',
  save: 'Could not create the category. Try again.',
};

export default function NewCategoryPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const error = searchParams.error ? ERRORS[searchParams.error] ?? 'Something went wrong.' : null;

  return (
    <>
      <Link
        href="/admin/categories/"
        className="type-label text-ink-muted hover:text-brand-deep transition-colors duration-200 inline-block mb-5"
      >
        ← All categories
      </Link>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ IX. Categories / New</p>
        <h1
          className="font-display text-ink"
          style={{ fontSize: '36px', lineHeight: 1, letterSpacing: '-0.024em' }}
        >
          Add a <em className="type-accent">category</em>.
        </h1>
        <p className="type-data-mono text-ink-muted mt-3 max-w-[560px]">
          The URL slug is generated from the name. Leave order blank to add it to
          the end — you can reorder it after.
        </p>
      </header>

      {error && (
        <div
          className="bg-cream mb-6 max-w-[640px]"
          style={{ border: '1px solid var(--accent)', padding: '12px 16px' }}
          role="alert"
        >
          <p className="type-data-mono text-accent">{error}</p>
        </div>
      )}

      <form
        action="/api/admin/categories/create/"
        method="POST"
        className="max-w-[640px] flex flex-col gap-5"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="type-label-sm text-ink">
            Category name <span className="text-accent" aria-hidden="true">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            className="bg-cream text-ink font-display"
            style={{ border: '1px solid var(--rule-strong)', padding: '10px 14px', fontSize: '14px' }}
          />
        </div>
        <div className="flex flex-col gap-2 max-w-[200px]">
          <label htmlFor="display_order" className="type-label-sm text-ink">
            Order
          </label>
          <input
            id="display_order"
            name="display_order"
            type="number"
            step="1"
            placeholder="end"
            className="bg-cream text-ink font-display"
            style={{ border: '1px solid var(--rule-strong)', padding: '10px 14px', fontSize: '14px' }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="description" className="type-label-sm text-ink">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            placeholder="Shown as the lede on the category landing page."
            className="bg-cream text-ink font-display"
            style={{ border: '1px solid var(--rule-strong)', padding: '10px 14px', fontSize: '14px' }}
          />
        </div>
        <div className="flex gap-4 pt-3">
          <button
            type="submit"
            className="type-label-sm text-cream"
            style={{ padding: '12px 22px', background: 'var(--color-ink)' }}
          >
            Create category →
          </button>
          <Link
            href="/admin/categories/"
            className="type-label-sm text-ink-muted hover:text-accent self-center"
          >
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
