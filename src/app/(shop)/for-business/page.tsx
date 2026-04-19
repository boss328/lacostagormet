import Link from 'next/link';
import { Fragment } from 'react';
import { Reveal } from '@/components/design-system/Reveal';
import { SectionHead } from '@/components/design-system/SectionHead';
import { Button } from '@/components/design-system/Button';

export const metadata = {
  title: 'For Business',
  description:
    'Volume pricing, reliable supply, and a named contact for cafés, offices, and independent kitchens. Family-run from Carlsbad since 2003.',
};

type Tier = {
  roman: string;
  label: string;
  threshold: string;
  headline: string;
  bullets: string[];
};

const TIERS: Tier[] = [
  {
    roman: 'I',
    label: 'Standard',
    threshold: '$0 – 399',
    headline: 'Standard pricing',
    bullets: [
      'Catalog pricing, no minimum order',
      'Free ground shipping on orders $70+',
      'Ships from Carlsbad in 1–2 business days',
    ],
  },
  {
    roman: 'II',
    label: 'Volume tier 1',
    threshold: '$400 – 699',
    headline: 'Contact for custom quote',
    bullets: [
      'Volume discount applied case-by-case',
      'Priority dispatch on reorders',
      'Named contact on your account',
    ],
  },
  {
    roman: 'III',
    label: 'Volume tier 2',
    threshold: '$700 +',
    headline: 'Contact for custom quote',
    bullets: [
      'Deepest tier discount, by quote',
      'Consolidated monthly invoicing available',
      'First-look at new brand additions',
    ],
  },
];

type Testimonial = {
  quote: string;
  name: string;
  role: string;
  place: string;
};

/* TODO: replace with real testimonials from Jeff's customers */
const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'Six years of the same Big Train Vanilla Chai on our shelf. We reorder every six weeks and it shows up on time, every time.',
    name: 'Rachel M.',
    role: 'Owner',
    place: 'Coast Coffee, Oceanside',
  },
  {
    quote:
      'They know us by name. When a case was short one week, Jeff answered the phone himself and had a replacement on a truck the next morning.',
    name: 'David L.',
    role: 'Manager',
    place: 'Blue Palm Cafe, San Diego',
  },
  {
    quote:
      'We stopped shopping around three years ago. The pricing works, the quality works, and we never have to chase an order.',
    name: 'Sara K.',
    role: 'Chef',
    place: 'Palm Office Kitchen, Carlsbad',
  },
];

const VOLUME_OPTIONS = [
  { value: '', label: 'Select an estimate' },
  { value: 'under-500', label: 'Under $500 / month' },
  { value: '500-2k', label: '$500 – $2,000 / month' },
  { value: '2k-5k', label: '$2,000 – $5,000 / month' },
  { value: '5k-plus', label: '$5,000+ / month' },
];

export default function ForBusinessPage() {
  return (
    <>
      {/* Hero — dark ink, 2-column */}
      <section
        className="relative bg-brand-darker text-cream overflow-hidden"
        style={{ borderBottom: '2px solid var(--color-gold)' }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 85% 40%, rgba(184, 138, 72, 0.18) 0%, transparent 58%)',
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-25"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(184, 138, 72, 0.05) 0 1px, transparent 1px 9px)',
          }}
        />

        <div className="relative max-w-content mx-auto px-8 pt-24 pb-28 max-sm:px-5 max-sm:pt-16 max-sm:pb-20 grid items-center gap-14 max-lg:gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Left — copy */}
          <div>
            <div className="stagger-1 flex items-center gap-3.5 mb-9 max-sm:mb-6">
              <span
                className="h-px w-12"
                style={{ background: 'rgba(212, 169, 97, 0.55)' }}
              />
              <span
                className="font-mono uppercase text-gold-bright whitespace-nowrap"
                style={{ fontSize: '10px', letterSpacing: '0.30em' }}
              >
                For cafés, offices &amp; independent business
              </span>
            </div>

            <h1
              className="stagger-2 font-display mb-9 max-sm:mb-6"
              style={{
                fontSize: '76px',
                lineHeight: 0.98,
                letterSpacing: '-0.032em',
                fontWeight: 400,
                color: 'var(--color-cream)',
              }}
            >
              A trusted <em className="type-accent-gold">partner</em>
              <br />
              since 2003.
            </h1>

            <p
              className="stagger-3 font-display text-cream/80 mb-10 max-w-[540px]"
              style={{ fontSize: '18px', lineHeight: 1.65 }}
            >
              Twenty-two years stocking independent coffee shops, bagel counters, and
              office kitchens across the country — one hundred twenty-one SKUs,
              fourteen brands, and a named person who answers the phone. Our café
              customers reorder the same cases every six weeks like clockwork, because
              it works and because we know them by name.
            </p>

            <div className="stagger-4 flex flex-wrap items-center gap-3.5">
              <Button variant="outline-gold" arrow href="#contact">
                Open an Account
              </Button>
              <Button variant="outline-gold" arrow href="/shop">
                Browse the Catalog
              </Button>
            </div>
          </div>

          {/* Right — inset contact card */}
          <div
            className="scale-in relative"
            style={{
              border: '1px solid rgba(184, 138, 72, 0.45)',
              background: 'rgba(26, 17, 10, 0.55)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              padding: '36px',
            }}
          >
            <div
              aria-hidden="true"
              className="absolute pointer-events-none"
              style={{
                top: 8,
                left: 8,
                right: 8,
                bottom: 8,
                border: '1px solid rgba(184, 138, 72, 0.15)',
              }}
            />

            <div className="relative">
              <p
                className="font-mono uppercase text-gold-bright mb-8"
                style={{ fontSize: '10px', letterSpacing: '0.26em' }}
              >
                The short version
              </p>
              <p
                className="font-display text-cream mb-6"
                style={{ fontSize: '22px', lineHeight: 1.3, letterSpacing: '-0.01em' }}
              >
                Fourteen brands. One warehouse. No ticket queue.
              </p>
              <p
                className="font-display italic text-gold-bright mb-8"
                style={{ fontSize: '17px', lineHeight: 1.5, letterSpacing: '-0.02em' }}
              >
                &ldquo;They know us by name.&rdquo;
              </p>

              <dl
                className="flex flex-col"
                style={{ borderTop: '1px solid rgba(184, 138, 72, 0.3)' }}
              >
                <DarkStat label="Customers" value="Independent cafés & offices" />
                <DarkStat label="Catalog" value="121 SKUs · 14 brands" />
                <DarkStat label="Based" value="Carlsbad, California" />
                <DarkStat label="Years" value="Twenty-two and counting" />
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* Volume pricing tiers */}
      <Reveal as="section" className="bg-paper-2">
        <div className="max-w-content mx-auto px-8 pt-24 pb-20 max-sm:px-5 max-sm:pt-16 max-sm:pb-14">
          <SectionHead
            numeral="I"
            eyebrow="Volume pricing"
            title="Three tiers, {italic}one catalog{/italic}."
          />
          <div className="grid gap-5 max-lg:grid-cols-1 lg:grid-cols-3">
            {TIERS.map((t, i) => (
              <Reveal key={t.roman} delay={i * 0.08}>
                <article
                  className="bg-cream h-full flex flex-col"
                  style={{ border: '1px solid var(--rule-strong)', padding: '32px' }}
                >
                  <div className="flex items-baseline gap-4 mb-8">
                    <span
                      className="font-display italic text-brand-deep"
                      style={{
                        fontSize: '44px',
                        lineHeight: 1,
                        letterSpacing: '-0.02em',
                        fontWeight: 500,
                      }}
                    >
                      {t.roman}
                    </span>
                    <span className="type-label text-ink-muted">{t.label}</span>
                  </div>

                  <div
                    className="pb-5 mb-6"
                    style={{ borderBottom: '1px solid var(--rule)' }}
                  >
                    <p
                      className="type-price"
                      style={{ fontSize: '32px', lineHeight: 1 }}
                    >
                      {t.threshold}
                    </p>
                    <p className="type-label-sm text-ink-muted mt-3">per order</p>
                  </div>

                  <p
                    className="font-display text-ink mb-6"
                    style={{ fontSize: '20px', lineHeight: 1.3, letterSpacing: '-0.01em' }}
                  >
                    {t.headline}
                  </p>

                  <ul className="flex flex-col gap-3 flex-1">
                    {t.bullets.map((b) => (
                      <li
                        key={b}
                        className="type-product text-ink-2 flex items-start gap-3"
                      >
                        <span
                          aria-hidden="true"
                          className="text-gold shrink-0"
                          style={{ fontSize: '18px', lineHeight: 1, marginTop: 2 }}
                        >
                          ·
                        </span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>

          <p className="type-data-mono text-ink-muted mt-10 text-center">
            Tier mechanics (auto-applied discount vs. quote-based) are finalised per
            account. <Link href="#contact" className="underline underline-offset-[3px] hover:text-brand-deep transition-colors duration-200">Get in touch</Link> to lock yours in.
          </p>
        </div>
      </Reveal>

      {/* Testimonials */}
      {/* TODO: replace with real testimonials from Jeff's customers */}
      <Reveal as="section" className="bg-paper">
        <div className="max-w-content mx-auto px-8 pt-24 pb-20 max-sm:px-5 max-sm:pt-16 max-sm:pb-14">
          <SectionHead
            numeral="II"
            eyebrow="In their words"
            title="Some of the folks we {italic}stock{/italic}."
          />
          <div className="grid gap-px max-lg:grid-cols-1 lg:grid-cols-3" style={{ background: 'var(--rule)' }}>
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={i * 0.08}>
                <figure
                  className="bg-paper flex flex-col h-full"
                  style={{ padding: '32px' }}
                >
                  <span
                    aria-hidden="true"
                    className="font-display italic text-gold-bright mb-4"
                    style={{ fontSize: '48px', lineHeight: 0.5, fontWeight: 400 }}
                  >
                    &ldquo;
                  </span>
                  <blockquote
                    className="font-display italic text-ink-2 mb-8 flex-1"
                    style={{
                      fontSize: '22px',
                      lineHeight: 1.4,
                      letterSpacing: '-0.015em',
                      fontWeight: 400,
                    }}
                  >
                    {t.quote}
                  </blockquote>
                  <figcaption
                    className="type-label-sm text-ink-muted"
                    style={{ paddingTop: 16, borderTop: '1px dashed var(--rule)' }}
                  >
                    {t.name.toUpperCase()}
                    <span className="text-ink-muted/60 mx-2" aria-hidden="true">·</span>
                    {t.role.toUpperCase()}
                    <span className="text-ink-muted/60 mx-2" aria-hidden="true">·</span>
                    {t.place.toUpperCase()}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Contact section */}
      <Reveal
        as="section"
        id="contact"
        className="bg-paper-2"
      >
        <div className="max-w-content mx-auto px-8 pt-24 pb-28 max-sm:px-5 max-sm:pt-16 max-sm:pb-20">
          <SectionHead
            numeral="III"
            eyebrow="Open an account"
            title="Tell us about your {italic}business{/italic}."
          />
          <div className="grid gap-14 max-lg:gap-10 lg:grid-cols-[1.3fr_1fr]">
            {/* Left — form shell (non-interactive for v1) */}
            {/* TODO: wire form submission in Phase 5 (auth + /api/business-inquiries) */}
            <form
              className="bg-cream"
              style={{ border: '1px solid var(--rule-strong)', padding: '32px' }}
              action=""
              method="post"
            >
              <div className="grid gap-5 max-sm:gap-4">
                <Field label="Your name" name="name" type="text" required />
                <Field label="Business name" name="business" type="text" required />
                <div className="grid gap-5 max-sm:gap-4 sm:grid-cols-2">
                  <Field label="Email" name="email" type="email" required />
                  <Field label="Phone" name="phone" type="tel" />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="volume" className="type-label-sm text-ink">
                    Monthly volume estimate
                  </label>
                  <select
                    id="volume"
                    name="volume"
                    className="bg-cream text-ink font-display"
                    style={{
                      border: '1px solid var(--rule-strong)',
                      padding: '12px 14px',
                      fontSize: '15px',
                      lineHeight: 1.4,
                    }}
                    defaultValue=""
                  >
                    {VOLUME_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="notes" className="type-label-sm text-ink">
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={4}
                    className="bg-cream text-ink font-display"
                    style={{
                      border: '1px solid var(--rule-strong)',
                      padding: '12px 14px',
                      fontSize: '15px',
                      lineHeight: 1.5,
                      resize: 'vertical',
                    }}
                    placeholder="SKUs you're interested in, current supplier, anything we should know."
                  />
                </div>
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled
                    aria-disabled="true"
                    className="btn btn-solid w-full justify-center opacity-60 cursor-not-allowed"
                    style={{ padding: '18px 26px' }}
                  >
                    <span>Send inquiry</span>
                    <span className="btn-arrow" aria-hidden="true">→</span>
                  </button>
                  <p className="type-data-mono text-ink-muted mt-3 text-center">
                    Form wiring arrives in Phase 5 — use the phone line below for now.
                  </p>
                </div>
              </div>
            </form>

            {/* Right — direct contact */}
            <aside
              className="flex flex-col"
              style={{ border: '1px solid var(--rule-strong)', padding: '32px', background: 'var(--color-paper)' }}
            >
              <p className="type-label text-accent mb-6">§ Or call directly</p>

              {/* TODO: replace with Jeff's real phone */}
              <p
                className="font-display italic text-brand-deep mb-4"
                style={{ fontSize: '34px', lineHeight: 1, letterSpacing: '-0.025em', fontWeight: 500 }}
              >
                (760) XXX-XXXX
              </p>

              <p className="type-label-sm text-ink-muted mb-8">
                Monday thru Friday · 9–5 Pacific
              </p>

              <div
                className="pt-6 mt-auto flex flex-col gap-5"
                style={{ borderTop: '1px solid var(--rule)' }}
              >
                <ContactLine label="Email" value="info@lacostagourmet.com" href="mailto:info@lacostagourmet.com" />
                <ContactLine label="Warehouse" value="Carlsbad, California 92009" />
                <ContactLine label="Established" value="Anno 2003" />
              </div>
            </aside>
          </div>
        </div>
      </Reveal>
    </>
  );
}

function Field({
  label,
  name,
  type,
  required = false,
}: {
  label: string;
  name: string;
  type: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="type-label-sm text-ink">
        {label}
        {required && <span className="text-accent ml-1" aria-hidden="true">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        className="bg-cream text-ink font-display"
        style={{
          border: '1px solid var(--rule-strong)',
          padding: '12px 14px',
          fontSize: '15px',
          lineHeight: 1.4,
        }}
      />
    </div>
  );
}

function DarkStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 py-3.5"
      style={{ borderBottom: '1px solid rgba(184, 138, 72, 0.18)' }}
    >
      <dt
        className="font-mono uppercase text-gold-bright/70"
        style={{ fontSize: '10px', letterSpacing: '0.26em' }}
      >
        {label}
      </dt>
      <dd className="font-display text-cream text-right" style={{ fontSize: '14px' }}>
        {value}
      </dd>
    </div>
  );
}

function ContactLine({ label, value, href }: { label: string; value: string; href?: string }) {
  const body = href ? (
    <a
      href={href}
      className="font-display text-ink hover:text-brand-deep transition-colors duration-200"
      style={{ fontSize: '16px' }}
    >
      {value}
    </a>
  ) : (
    <span className="font-display text-ink" style={{ fontSize: '16px' }}>
      {value}
    </span>
  );
  return (
    <div className="flex flex-col gap-1">
      <span className="type-label-sm text-ink-muted">{label}</span>
      {body}
    </div>
  );
}
