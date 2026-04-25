import { Fragment } from 'react';
import Link from 'next/link';
import { Button } from '@/components/design-system/Button';

const B2B_BENEFITS: Array<{ n: string; body: string }> = [
  { n: '01', body: 'Volume pricing tiers at $400 and $700+ order thresholds' },
  { n: '02', body: 'Bulk order consolidation direct from Carlsbad' },
  { n: '03', body: 'Downloadable line sheets for your buyers and accountants' },
  { n: '04', body: 'Named contact — not a call-center ticket queue' },
];

export function HomeB2BBand() {
  return (
    <section
      className="relative bg-brand-darker text-cream overflow-hidden"
      style={{ borderTop: '2px solid var(--color-gold)', borderBottom: '2px solid var(--color-gold)' }}
    >
      {/* Subtle gold radial + diagonal texture */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 80% 50%, rgba(184, 138, 72, 0.15) 0%, transparent 55%)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(184, 138, 72, 0.04) 0 1px, transparent 1px 8px)',
        }}
      />

      <div className="relative max-w-content mx-auto px-8 py-24 max-sm:px-5 max-sm:py-16 grid items-center gap-16 max-lg:gap-10 lg:grid-cols-[1fr_0.95fr]">
        {/* Left — copy */}
        <div>
          <div className="flex items-center gap-3.5 mb-8">
            <span className="h-px w-12" style={{ background: 'rgba(212, 169, 97, 0.55)' }} />
            <span
              className="font-mono uppercase text-gold-bright"
              style={{ fontSize: '10px', letterSpacing: '0.30em' }}
            >
              For Baristas, Cafés &amp; Coffee Shops
            </span>
          </div>

          <h3
            className="font-display mb-8 max-sm:mb-6"
            style={{
              fontSize: '56px',
              lineHeight: 1.02,
              letterSpacing: '-0.028em',
              fontWeight: 400,
              color: 'var(--color-cream)',
            }}
          >
            Volume pricing,
            <br />
            <em className="type-accent-gold">reliable supply</em>.
          </h3>

          <p
            className="font-display text-cream/80 mb-10 max-w-[520px]"
            style={{ fontSize: '17px', lineHeight: 1.65 }}
          >
            Providing homes and businesses with Big Train chai, cocoa, frappé, and
            specialty café products at volume pricing. Our customers reorder like
            clockwork — because it works, and because they know us by name.
          </p>

          <Button variant="outline-gold" arrow href="/for-business">
            Open a Business Account
          </Button>
        </div>

        {/* Right — glass inset */}
        <div
          className="relative"
          style={{
            border: '1px solid rgba(184, 138, 72, 0.45)',
            background: 'rgba(26, 17, 10, 0.45)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            padding: '32px',
          }}
        >
          {/* Inner double-frame */}
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
              className="font-mono uppercase text-gold-bright mb-6"
              style={{ fontSize: '10px', letterSpacing: '0.26em' }}
            >
              What you get
            </p>

            <ol className="space-y-0">
              {B2B_BENEFITS.map((b, i) => (
                <Fragment key={b.n}>
                  <li className="flex items-baseline gap-5 py-4">
                    <span
                      className="font-display italic text-gold-bright shrink-0"
                      style={{ fontSize: '22px', lineHeight: 1, letterSpacing: '-0.02em', fontWeight: 500 }}
                    >
                      {b.n}
                    </span>
                    <span
                      className="font-display text-cream"
                      style={{ fontSize: '15px', lineHeight: 1.5 }}
                    >
                      {b.body}
                    </span>
                  </li>
                  {i < B2B_BENEFITS.length - 1 && (
                    <hr
                      className="border-0"
                      style={{ borderTop: '1px dashed rgba(184, 138, 72, 0.22)' }}
                    />
                  )}
                </Fragment>
              ))}
            </ol>

            <div
              className="mt-6 pt-6 flex items-baseline justify-between gap-4"
              style={{ borderTop: '1px solid rgba(184, 138, 72, 0.3)' }}
            >
              <div>
                <p
                  className="font-mono uppercase text-cream/60"
                  style={{ fontSize: '9px', letterSpacing: '0.24em' }}
                >
                  Want the full picture?
                </p>
              </div>
              <Link
                href="/for-business"
                className="font-mono uppercase text-gold-bright hover:text-cream transition-colors duration-300"
                style={{ fontSize: '11px', letterSpacing: '0.22em' }}
              >
                Learn more&nbsp;→
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
