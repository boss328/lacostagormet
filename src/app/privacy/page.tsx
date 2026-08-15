import { PageHeader } from '@/components/shop/PageHeader';

export const metadata = {
  title: 'Privacy Policy',
  description:
    'What La Costa Gourmet collects, why, and who touches it. Plain-language privacy policy · Carlsbad, CA.',
  alternates: { canonical: '/privacy/' },
};

/**
 * Grounded in what the stack actually does: card entry happens on
 * Authorize.net's hosted page (we never see numbers), data lives in
 * Supabase, transactional + reminder email goes through Resend, and
 * analytics is GA4. If an integration changes, change this page in the
 * same PR — Google Shopping and plain honesty both require it to be true.
 */

function Section({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="type-label text-accent">§ {eyebrow}</h2>
      {children}
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/', label: 'Home' },
          { label: 'Privacy' },
        ]}
        eyebrow="§ Privacy policy"
        title={
          <>
            Your data, <em className="type-accent">plainly</em>.
          </>
        }
        lede="What we collect, why we collect it, and who touches it — written to be read, not skimmed past. Effective August 10, 2026."
      />

      <section className="max-w-content mx-auto px-8 py-14 max-md:px-4 max-md:py-6">
        <div className="max-w-[680px] flex flex-col gap-10">
          <Section eyebrow="Who we are">
            <p className="type-body">
              La Costa Gourmet is a family-owned café supply company in Carlsbad,
              California, operating lacostagourmet.com. Questions about this
              policy or your data:{' '}
              <a
                href="mailto:customercare@lacostagourmet.com"
                className="text-brand-deep hover:text-ink transition-colors"
              >
                customercare@lacostagourmet.com
              </a>{' '}
              or{' '}
              <a
                href="tel:+18583541120"
                className="text-brand-deep hover:text-ink transition-colors"
              >
                (858) 354-1120
              </a>
              .
            </p>
          </Section>

          <Section eyebrow="What we collect">
            <p className="type-body">
              When you place an order: your name, email address, shipping
              address, phone number, and what you bought. When you create an
              account: your email address. When you write to us: whatever you
              include in the message. While you shop: your cart contents, kept
              in your own browser.
            </p>
            <p className="type-body">
              <strong className="text-ink">What we never collect: your card
              number.</strong> Payment details are entered directly on our
              payment processor&rsquo;s secure page (Authorize.net) and never
              pass through our servers. We receive only the outcome of the
              charge, the card brand, and the last four digits — enough to show
              on your receipt and nothing more.
            </p>
          </Section>

          <Section eyebrow="What we do with it">
            <p className="type-body">
              We use your information to fulfill and ship orders, send order
              confirmations and shipping notices, answer your messages, and —
              if you started a checkout and stepped away — send a small number
              of cart reminder emails, each with a working unsubscribe link
              that we honor immediately. That&rsquo;s the list. We do not sell
              or rent personal information to anyone.
            </p>
          </Section>

          <Section eyebrow="Who touches it">
            <p className="type-body">
              A short roster of service providers, each doing one job:
              Authorize.net processes payments; Supabase hosts our database;
              Vercel hosts the website; Resend delivers our email; Google
              Analytics gives us anonymous usage statistics so we know which
              pages work. Each receives only what its job requires.
            </p>
          </Section>

          <Section eyebrow="Cookies">
            <p className="type-body">
              We use a session cookie to keep you signed in to your account,
              browser storage to remember your cart between visits, and Google
              Analytics cookies to measure site usage. We don&rsquo;t run
              third-party advertising trackers.
            </p>
          </Section>

          <Section eyebrow="Retention and your rights">
            <p className="type-body">
              Order records are kept as long as we need them for bookkeeping,
              taxes, and warranty of what we sold you. You can ask us at any
              time to show you the personal information we hold about you,
              correct it, or delete it — email{' '}
              <a
                href="mailto:customercare@lacostagourmet.com"
                className="text-brand-deep hover:text-ink transition-colors"
              >
                customercare@lacostagourmet.com
              </a>{' '}
              and we&rsquo;ll handle it promptly. California residents may have
              additional rights under California privacy law; the same email
              reaches the person who can honor them.
            </p>
          </Section>

          <Section eyebrow="Children">
            <p className="type-body">
              Our store sells café supplies in bulk and is not directed at
              children. We do not knowingly collect personal information from
              anyone under 13.
            </p>
          </Section>

          <Section eyebrow="Changes">
            <p className="type-body">
              If this policy changes, the new version appears here with a new
              effective date. Material changes to how we handle existing data
              would be announced to affected customers by email.
            </p>
            <p className="type-data-mono text-ink-muted">
              Effective August 10, 2026 · La Costa Gourmet · Carlsbad, California
            </p>
          </Section>
        </div>
      </section>
    </>
  );
}
