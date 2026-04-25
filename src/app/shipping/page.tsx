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
          <Row label="Free shipping threshold" value="$70 continental US" />
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
          <Row label="Carriers" value="USPS Priority · UPS Ground · FedEx Home" />
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
