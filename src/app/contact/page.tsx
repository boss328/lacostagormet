import { PageHeader } from '@/components/shop/PageHeader';

export const metadata = {
  title: 'Contact',
  description:
    'Reach La Costa Gourmet — Carlsbad, California. (858) 354-1120 · Monday through Friday, 9–5 Pacific.',
};

export default function ContactPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/', label: 'Home' },
          { label: 'Contact' },
        ]}
        eyebrow="§ Say hello"
        title={
          <>
            Get in <em className="type-accent">touch</em>.
          </>
        }
        lede="Jeff answers the phone. Call, email, or stop by the warehouse — we're happy to talk shop."
      />

      <section className="max-w-content mx-auto px-8 py-14 max-md:px-4 max-md:py-6">
        <div className="grid gap-10 max-lg:gap-6 lg:grid-cols-[1fr_1fr] max-w-[900px]">
          <div
            className="bg-cream"
            style={{ border: '1px solid var(--rule-strong)', padding: '28px' }}
          >
            <p className="type-label text-accent mb-5">§ By phone</p>
            <a
              href="tel:+18583541120"
              className="font-display italic text-brand-deep hover:opacity-80 transition-opacity block mb-3"
              style={{ fontSize: '30px', lineHeight: 1, letterSpacing: '-0.025em', fontWeight: 500 }}
            >
              (858) 354-1120
            </a>
            <p className="type-data-mono text-ink-muted">
              Monday through Friday · 9–5 Pacific
            </p>
          </div>

          <div
            className="bg-paper"
            style={{ border: '1px solid var(--rule-strong)', padding: '28px' }}
          >
            <p className="type-label text-accent mb-5">§ By email</p>
            <a
              href="mailto:info@lacostagourmet.com"
              className="font-display italic text-brand-deep hover:opacity-80 transition-opacity block mb-3"
              style={{ fontSize: '22px', lineHeight: 1, letterSpacing: '-0.02em', fontWeight: 500 }}
            >
              info@lacostagourmet.com
            </a>
            <p className="type-data-mono text-ink-muted">
              Replies within one business day.
            </p>
          </div>

          <address
            className="not-italic lg:col-span-2"
            style={{ border: '1px solid var(--rule)', padding: '24px 28px', background: 'var(--color-paper-2)' }}
          >
            <p className="type-label text-ink-muted mb-4">§ The warehouse</p>
            <p className="font-display italic text-brand-deep" style={{ fontSize: '20px', lineHeight: 1.3, fontWeight: 500 }}>
              6209 Paseo Privado
            </p>
            <p className="font-display text-ink" style={{ fontSize: '15px', lineHeight: 1.5 }}>
              Carlsbad, California 92009
            </p>
            <p className="type-data-mono text-ink-muted mt-3">
              Est. MMIII · 22 years of shipping from the same warm corner.
            </p>
          </address>
        </div>
      </section>
    </>
  );
}
