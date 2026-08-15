import Link from 'next/link';
import { PageHeader } from '@/components/shop/PageHeader';

export const metadata = {
  title: 'Terms of Service',
  description:
    'The terms that govern orders on lacostagourmet.com — pricing, payment, shipping, returns, and the fine print, kept short.',
  alternates: { canonical: '/terms/' },
};

function Section({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="type-label text-accent">§ {eyebrow}</h2>
      {children}
    </div>
  );
}

export default function TermsPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/', label: 'Home' },
          { label: 'Terms' },
        ]}
        eyebrow="§ Terms of service"
        title={
          <>
            The <em className="type-accent">fine print</em>, kept short.
          </>
        }
        lede="Placing an order on lacostagourmet.com means you agree to these terms. They're written to be understood on the first read. Effective August 10, 2026."
      />

      <section className="max-w-content mx-auto px-8 py-14 max-md:px-4 max-md:py-6">
        <div className="max-w-[680px] flex flex-col gap-10">
          <Section eyebrow="Orders">
            <p className="type-body">
              An order is an offer to buy; it&rsquo;s accepted when we confirm
              and charge it. We may cancel and fully refund any order before
              shipment — for example when a listing contains a pricing or
              description error, or stock ran out between your click and our
              warehouse. If we cancel, you get your money back and an email
              explaining why, promptly.
            </p>
          </Section>

          <Section eyebrow="Pricing">
            <p className="type-body">
              Prices are in U.S. dollars and can change without notice, but
              never for an order already placed. If a price on the site is
              plainly a mistake, we&rsquo;ll contact you with the correct price
              before charging anything further — you can keep the order at the
              correct price or cancel for a full refund.
            </p>
          </Section>

          <Section eyebrow="Payment">
            <p className="type-body">
              Payment is processed by Authorize.net on their secure page at the
              time of order; we never see or store your card number. Your
              statement will show La Costa Gourmet.
            </p>
          </Section>

          <Section eyebrow="Shipping">
            <p className="type-body">
              We ship within the continental United States: orders of $70 or
              more ship free, orders from $30 to $69.99 ship for $12.95, and
              orders under $30 ship for $9.95. Alaska and Hawaii incur a
              surcharge. Details and current transit expectations live on the{' '}
              <Link href="/shipping/" className="text-brand-deep hover:text-ink transition-colors">
                shipping page
              </Link>
              . Risk of loss passes to you on delivery; if a package arrives
              damaged, photograph it before opening and call us.
            </p>
          </Section>

          <Section eyebrow="Returns">
            <p className="type-body">
              Contact us within 30 days of receipt to arrange a return —
              the full policy is on the{' '}
              <Link href="/returns/" className="text-brand-deep hover:text-ink transition-colors">
                returns page
              </Link>
              . Because we sell food products, items must be unopened and in
              resalable condition unless the return is for damage or our error.
            </p>
          </Section>

          <Section eyebrow="Food products">
            <p className="type-body">
              We sell products from many manufacturers. Ingredient, allergen,
              and nutrition information comes from the manufacturer and can
              change — always read the label on the product you receive before
              serving it, especially where allergies are involved. Store
              products as the label directs.
            </p>
          </Section>

          <Section eyebrow="Your account">
            <p className="type-body">
              Keep your sign-in credentials to yourself; you&rsquo;re
              responsible for orders placed from your account. We may suspend
              accounts used fraudulently or abusively.
            </p>
          </Section>

          <Section eyebrow="Our content">
            <p className="type-body">
              The text, photography, and design of this site belong to La Costa
              Gourmet or our suppliers. Product names and brands belong to
              their manufacturers, who don&rsquo;t sponsor or endorse this
              site — we&rsquo;re a reseller of their fine products.
            </p>
          </Section>

          <Section eyebrow="Liability">
            <p className="type-body">
              The site is provided as-is. To the extent the law allows, our
              total liability for any claim connected to an order is limited to
              the amount you paid for that order. Nothing here limits rights
              that consumer law doesn&rsquo;t let us limit.
            </p>
          </Section>

          <Section eyebrow="Governing law and contact">
            <p className="type-body">
              These terms are governed by the laws of the State of California.
              Questions, disputes, or anything unclear:{' '}
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
              </a>{' '}
              — a person answers, and most things resolve in one call.
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
