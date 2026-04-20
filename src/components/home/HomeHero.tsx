import Image from 'next/image';
import { Button } from '@/components/design-system/Button';
import { HERO_IMAGE } from '@/lib/placeholder-images';

const HERO_STATS: Array<{ value: string; label: string }> = [
  { value: '22',  label: 'Years in Trade' },
  { value: '42%', label: 'Reorder Rate'  },
  { value: '14',  label: 'Brands Stocked' },
];

export function HomeHero() {
  return (
    <section className="relative overflow-hidden bg-cream border-b border-ink">
      {/* Subtle gold radial top-right */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 85% 15%, rgba(184, 138, 72, 0.09) 0%, transparent 45%)',
        }}
      />

      <div className="relative max-w-content mx-auto px-8 pt-20 pb-16 grid items-center gap-14 max-md:px-5 max-md:pt-10 max-md:pb-10 max-md:gap-8 lg:grid-cols-[1.15fr_1fr]">
        {/* Mobile order flip: on narrow viewports the image+stats column
            should render first (visual anchor), then the text/CTA column
            below it. lg+ keeps the original reading order (text left,
            image right) via the grid auto-flow. */}
        {/* Left column — eyebrow, h1, lede, CTAs */}
        <div className="max-lg:order-2">
          <div className="stagger-1 flex items-center gap-3.5 mb-10 max-sm:mb-7">
            <span className="h-px flex-1" style={{ background: 'rgba(193, 72, 40, 0.4)' }} />
            <span className="type-label text-accent whitespace-nowrap">
              The Twenty-Second Year
            </span>
            <span className="h-px flex-1" style={{ background: 'rgba(193, 72, 40, 0.4)' }} />
          </div>

          {/* Desktop punch-up: italic accent gets a heavier weight + darker
              brand colour at lg+ so "Café-quality drinks" reads first;
              mb-12 on lg+ gives the lede below ~20% more breathing room.
              Mobile untouched — still mb-10 → max-sm:mb-5. */}
          <h1 className="stagger-2 type-display-1 mb-10 max-sm:mb-5 lg:mb-12">
            <em className="type-accent lg:font-medium lg:text-brand-darker">Café-quality drinks</em>,
            <br className="max-md:hidden" />{' '}
            shipped to your door.
          </h1>

          <p
            className="stagger-3 type-body mb-10 max-w-[460px] pl-5 max-md:mb-6 max-md:pl-4"
            style={{
              backgroundImage:
                'linear-gradient(to bottom, var(--color-gold) 0%, transparent 100%)',
              backgroundSize: '1px 100%',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'left top',
            }}
          >
            Chai, cocoa, frappés, and smoothie bases — the same bulk-bag recipes
            trusted by independent coffee shops since 2003. Now available for
            your kitchen, your office, your next event. Ships nationwide from
            California, usually within one business day.
          </p>

          <div className="stagger-4 flex flex-wrap items-center gap-3.5">
            <Button variant="solid" arrow href="/shop">
              Shop the Catalog
            </Button>
            <Button variant="outline" arrow href="/for-business">
              For Business Accounts
            </Button>
          </div>
        </div>

        {/* Right column — hero image + stats strip (rendered first on
            mobile via order-1; lg+ falls back to grid flow = right col). */}
        <div className="flex flex-col gap-8 max-sm:gap-6 max-lg:order-1">
          <div className="scale-in">
            <div
              className="relative overflow-hidden img-overlay-radial max-md:aspect-[4/3] max-md:max-h-[60vh]"
              style={{ aspectRatio: '4 / 5', border: '1px solid var(--color-ink)' }}
            >
              <Image
                src={HERO_IMAGE.src}
                alt={HERO_IMAGE.alt}
                width={800}
                height={1000}
                sizes="(min-width: 1024px) 520px, 100vw"
                priority
                className="img-hero w-full h-full object-cover"
              />

              {/* Top-left: live + issue */}
              <div className="absolute top-5 left-5 flex items-center gap-3 z-10 max-md:top-3 max-md:left-3 max-md:gap-2">
                <span className="flex items-center gap-1.5 type-label-sm text-cream">
                  <span
                    className="pulse-dot inline-block w-1.5 h-1.5 bg-accent"
                    aria-hidden="true"
                  />
                  Live
                </span>
                <span className="type-label-sm text-cream/70">04 / 26</span>
              </div>

              {/* Bottom-left: dispatch tag */}
              <div
                className="absolute bottom-5 left-5 z-10 type-label-sm text-gold-bright max-md:bottom-3 max-md:left-3 max-md:!text-[8px] max-md:!px-1.5 max-md:!py-1"
                style={{
                  padding: '6px 10px',
                  background: 'rgba(26, 17, 10, 0.78)',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  border: '1px solid rgba(212, 169, 97, 0.35)',
                }}
              >
                Dispatch № 0042
              </div>

              {/* Bottom-right: coordinates */}
              <div className="absolute bottom-5 right-5 z-10 text-right max-md:bottom-3 max-md:right-3">
                <p className="type-label-sm text-cream leading-tight">Carlsbad, CA 92009</p>
                <p className="type-label-sm text-cream/60 leading-tight mt-1 max-md:hidden">
                  33.1°N · 117.3°W
                </p>
              </div>
            </div>
          </div>

          {/* 3-up stats strip */}
          <div
            className="stagger-5 grid grid-cols-3"
            style={{ borderTop: '1px solid var(--rule-strong)', borderBottom: '1px solid var(--rule-strong)' }}
          >
            {HERO_STATS.map((stat, i) => (
              <div
                key={stat.label}
                className="py-4 px-4 flex flex-col items-start max-md:py-2.5 max-md:px-2"
                style={{
                  borderLeft: i === 0 ? 'none' : '1px solid var(--rule)',
                }}
              >
                <span
                  className="font-display italic text-brand-deep max-md:!text-[20px]"
                  style={{ fontSize: '28px', lineHeight: 1, letterSpacing: '-0.02em', fontWeight: 500 }}
                >
                  {stat.value}
                </span>
                <span
                  className="font-mono uppercase text-ink-muted mt-2 max-md:mt-1 max-md:!text-[8px]"
                  style={{ fontSize: '9px', letterSpacing: '0.22em', lineHeight: 1.2 }}
                >
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
