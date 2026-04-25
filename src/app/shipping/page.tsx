import { PageHeader } from '@/components/shop/PageHeader';

export const metadata = {
  title: 'Shipping',
  description:
    'Five warehouses, coast to coast. Orders ship in 3 to 5 business days. Free shipping on continental US orders over $70.',
};

export default function ShippingPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/', label: 'Home' },
          { label: 'Shipping' },
        ]}
        eyebrow="§ Shipping information"
        title={
          <>
            How we <em className="type-accent">ship</em>.
          </>
        }
        lede="Five warehouses, coast to coast. Orders typically ship within 3 to 5 business days. Free shipping on orders over $70 continental US."
      />

      <section className="max-w-content mx-auto px-8 py-14 max-md:px-4 max-md:py-6">
        <div className="max-w-[720px] flex flex-col gap-5">
          <Row label="Free shipping threshold" value="See rate table below" />
          <Row label="Ship-out time" value="3 to 5 business days" />
          <Row
            label="Ships from"
            value={
              <>
                5 warehouses — coast to coast nationwide
                <br />
                <span className="text-ink-muted">West · Central · Northwest · South</span>
              </>
            }
          />
          <Row label="Carriers" value="FedEx · UPS · USPS Priority" />
          <Row
            label="Questions"
            value={
              <a
                href="tel:+18583541120"
                className="hover:text-brand-deep transition-colors"
              >
                (858) 354-1120 · Mon–Fri 9–5 PT
              </a>
            }
          />
        </div>
      </section>

      <section className="max-w-content mx-auto px-8 pb-16 max-md:px-4 max-md:pb-10">
        <div className="max-w-[720px]">
          <h2
            className="font-display mb-6 max-md:mb-4"
            style={{ fontSize: '32px', lineHeight: 1.1, letterSpacing: '-0.025em', fontWeight: 400 }}
          >
            Shipping rates.
          </h2>

          <div
            className="bg-cream"
            style={{ border: '1px solid var(--rule-strong)' }}
          >
            <div
              className="grid gap-4 py-3 px-5 max-sm:grid-cols-1 sm:grid-cols-[1fr_auto]"
              style={{ borderBottom: '1px solid var(--rule-strong)', background: 'var(--color-paper-2)' }}
            >
              <span className="type-label-sm text-ink-muted">Order subtotal</span>
              <span className="type-label-sm text-ink-muted text-right max-sm:text-left">Shipping</span>
            </div>
            <RateRow subtotal="$0 — $29.99" rate="$9.95" />
            <RateRow subtotal="$30 — $69.99" rate="$12.95" />
            <RateRow subtotal="$70 and above" rate="FREE" highlight />
          </div>

          <p className="type-data-mono text-ink-muted mt-4">
            Continental US only. Alaska, Hawaii, and international destinations
            — <a href="tel:+18583541120" className="text-brand-deep hover:text-ink transition-colors">contact us</a> for a quote.
          </p>
        </div>
      </section>
    </>
  );
}

function RateRow({
  subtotal,
  rate,
  highlight = false,
}: {
  subtotal: string;
  rate: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="grid gap-4 py-4 px-5 max-sm:grid-cols-1 sm:grid-cols-[1fr_auto] sm:items-baseline"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <span className="font-display text-ink" style={{ fontSize: '15px' }}>
        {subtotal}
      </span>
      {highlight ? (
        <span
          className="font-display italic text-gold-bright text-right max-sm:text-left"
          style={{ fontSize: '17px', letterSpacing: '-0.01em', fontWeight: 500 }}
        >
          {rate}
        </span>
      ) : (
        <span
          className="font-display text-ink text-right max-sm:text-left"
          style={{ fontSize: '17px', fontVariantNumeric: 'tabular-nums' }}
        >
          {rate}
        </span>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="grid gap-4 py-3 max-sm:grid-cols-1 sm:grid-cols-[200px_1fr]"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <span className="type-label-sm text-ink-muted">{label}</span>
      <span className="font-display text-ink" style={{ fontSize: '15px', lineHeight: 1.5 }}>
        {value}
      </span>
    </div>
  );
}
