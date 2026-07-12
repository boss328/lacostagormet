import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  name: 'Brand name is required.',
  exists: 'A brand with that name (or slug) already exists.',
  save: 'Could not create the brand. Try again.',
};

export default async function NewBrandPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const error = searchParams.error ? ERRORS[searchParams.error] ?? 'Something went wrong.' : null;

  const admin = createAdminClient();
  const { data: vendorsData } = await admin
    .from('vendors')
    .select('id, name')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  const vendors = (vendorsData ?? []) as Array<{ id: string; name: string }>;

  return (
    <>
      <Link
        href="/admin/brands/"
        className="type-label text-ink-muted hover:text-brand-deep transition-colors duration-200 inline-block mb-5"
      >
        ← All brands
      </Link>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ X. Brands / New</p>
        <h1
          className="font-display text-ink"
          style={{ fontSize: '36px', lineHeight: 1, letterSpacing: '-0.024em' }}
        >
          Add a <em className="type-accent">brand</em>.
        </h1>
        <p className="type-data-mono text-ink-muted mt-3 max-w-[560px]">
          The URL slug is generated from the name. The preferred vendor is optional —
          it&rsquo;s who this brand&rsquo;s purchase orders draft to.
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
        action="/api/admin/brands/create"
        method="POST"
        className="max-w-[640px] flex flex-col gap-5"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="type-label-sm text-ink">
            Brand name <span className="text-accent" aria-hidden="true">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            className="bg-cream text-ink font-display"
            style={{ border: '1px solid var(--rule-strong)', padding: '10px 14px', fontSize: '14px' }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="primary_vendor_id" className="type-label-sm text-ink">
            Preferred vendor
          </label>
          <select
            id="primary_vendor_id"
            name="primary_vendor_id"
            defaultValue=""
            className="bg-cream text-ink font-display"
            style={{ border: '1px solid var(--rule-strong)', padding: '10px 14px', fontSize: '14px' }}
          >
            <option value="">— None —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="description" className="type-label-sm text-ink">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
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
            Create brand →
          </button>
          <Link
            href="/admin/brands/"
            className="type-label-sm text-ink-muted hover:text-accent self-center"
          >
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
