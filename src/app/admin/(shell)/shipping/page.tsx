import type { Metadata } from 'next';
import Link from 'next/link';
import { SavedBoxTemplates } from '@/components/admin/shipping/SavedBoxTemplates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Shipping' };

export default function AdminShippingPage() {
  return (
    <>
      <header className="mb-8 border-b border-rule-strong pb-6">
        <p className="type-label text-accent mb-3">Fulfillment</p>
        <h1
          className="font-display text-ink max-md:!text-[24px]"
          style={{ fontSize: '40px', lineHeight: 1, letterSpacing: '-0.026em', fontWeight: 400 }}
        >
          Shipping
        </h1>
        <p className="mt-4 max-w-2xl text-sm text-ink-muted">
          Prepare orders for dispatch and keep your recurring box sizes in one place.
        </p>
      </header>

      <section aria-labelledby="shipping-orders-heading" className="mb-8 border border-rule-strong bg-cream p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="shipping-orders-heading" className="font-display text-2xl text-brand-deep">Ship an order</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-muted">
              Open an order to print its invoice or packing slip. Under <strong className="font-medium text-ink">Ship from my location</strong>,
              choose items, compare rates, print labels or record tracking.
            </p>
          </div>
          <Link href="/admin/orders/?view=pending-fulfillment" className="btn btn-solid min-h-[44px]">
            View orders to ship
          </Link>
        </div>
        <form action="/admin/orders/" method="get" className="mt-5 max-w-xl">
          <label htmlFor="shipping-order-search" className="block text-sm text-ink">Find an order</label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="shipping-order-search"
              type="search"
              name="q"
              required
              placeholder="Order number or customer email"
              className="min-h-[44px] min-w-0 flex-1 border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
            />
            <button type="submit" className="btn btn-outline min-h-[44px]">Find order</button>
          </div>
        </form>
      </section>

      <section aria-labelledby="shipping-boxes-heading">
        <h2 id="shipping-boxes-heading" className="font-display text-2xl text-brand-deep">Box templates</h2>
        <p className="mb-4 mt-2 max-w-2xl text-sm text-ink-muted">
          Create and manage the boxes you use often. Choose a saved box when preparing any order, then enter that parcel’s packed weight.
        </p>
        <SavedBoxTemplates />
      </section>
    </>
  );
}
