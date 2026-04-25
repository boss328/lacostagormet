import { PageHeader } from '@/components/shop/PageHeader';

export const metadata = {
  title: 'Returns',
  description:
    'Contact us within 30 days of receipt to arrange a return. La Costa Gourmet · Carlsbad, CA.',
};

export default function ReturnsPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/', label: 'Home' },
          { label: 'Returns' },
        ]}
        eyebrow="§ Returns"
        title={
          <>
            A simple <em className="type-accent">return</em> policy.
          </>
        }
        lede="Please contact us within 30 days of receipt to arrange a return. We'll walk you through the steps and, where appropriate, issue a refund or replacement."
      />

      <section className="max-w-content mx-auto px-8 py-14 max-md:px-4 max-md:py-6">
        <div className="max-w-[620px] flex flex-col gap-4">
          <p className="type-body">
            Reach out before sending anything back — we&rsquo;ll confirm the return
            path and, if it&rsquo;s a case or bulk order, the most sensible carrier
            for the package size.
          </p>
          <p className="type-body">
            <strong className="text-ink">Phone: </strong>
            <a
              href="tel:+18583541120"
              className="text-brand-deep hover:text-ink transition-colors"
            >
              (858) 354-1120
            </a>{' '}
            · Monday through Friday, 9–5 Pacific.
          </p>
          <p className="type-data-mono text-ink-muted">
            Damaged-in-transit? Take a photo before opening and call the same
            number — we usually have you squared away the same afternoon.
          </p>
        </div>
      </section>
    </>
  );
}
