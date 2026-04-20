import { PageHeader } from '@/components/shop/PageHeader';

export const metadata = {
  title: 'Shipping',
  description:
    'La Costa Gourmet ships nationwide from Carlsbad, California. Free shipping on continental US orders over $70.',
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
        lede="Ships nationwide from Carlsbad, California. Orders typically ship within one business day. Free shipping on orders over $70 continental US."
      />

      <section className="max-w-content mx-auto px-8 py-14 max-md:px-4 max-md:py-6">
        <div className="max-w-[720px] flex flex-col gap-5">
          <Row label="Free shipping threshold" value="$70 continental US" />
          <Row label="Ship-out time" value="Typically one business day" />
          <Row label="Ships from" value="Carlsbad, California" />
          <Row label="Carriers" value="UPS Ground · USPS Priority · FedEx Home" />
          <Row
            label="Questions"
            value={
              <a
                href="tel:+17609311028"
                className="hover:text-brand-deep transition-colors"
              >
                (760) 931-1028 · Mon–Fri 9–5 PT
              </a>
            }
          />
        </div>
      </section>
    </>
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
