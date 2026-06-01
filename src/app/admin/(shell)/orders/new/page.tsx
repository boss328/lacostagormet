import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { NewOrderForm, type NewOrderProductOption } from '@/components/admin/NewOrderForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New order',
};

/**
 * /admin/orders/new — admin places an order on behalf of a customer.
 * Pre-loads every active product as a typed dropdown so the line-item
 * picker can filter client-side without an extra round trip.
 *
 * The catalog is small (~120 SKUs), so shipping the full list per
 * server render is fine — much simpler than a server-side typeahead.
 */
export default async function NewOrderPage() {
  const admin = createAdminClient();

  const { data: productData } = await admin
    .from('products')
    .select('id, sku, name, retail_price, brand:brands(name)')
    .eq('is_active', true)
    .order('name');

  const products: NewOrderProductOption[] = (productData ?? []).map((p) => ({
    id: p.id as string,
    sku: p.sku as string,
    name: p.name as string,
    retailPrice: Number(p.retail_price),
    brandName:
      (p as { brand?: { name?: string } | null }).brand?.name ?? null,
  }));

  return (
    <>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ II.a New order</p>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h1
            className="font-display text-ink max-md:!text-[24px]"
            style={{ fontSize: '40px', lineHeight: 1, letterSpacing: '-0.026em', fontWeight: 400 }}
          >
            Place an <em className="type-accent">order</em>.
          </h1>
          <Link
            href="/admin/orders/"
            className="type-label-sm text-ink-muted hover:text-brand-deep"
          >
            ← Back to orders
          </Link>
        </div>
        <p className="type-data-mono text-ink-muted mt-3 max-w-[640px]">
          Manual / phone order on behalf of a customer. Payment is handled
          offline — toggle &ldquo;Mark as paid&rdquo; once you&rsquo;ve captured
          it in the Auth.net portal or invoiced. Line-item prices can be
          overridden for negotiated B2B quotes.
        </p>
      </header>

      <NewOrderForm products={products} />
    </>
  );
}
