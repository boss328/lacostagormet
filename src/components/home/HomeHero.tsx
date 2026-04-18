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

      <div className="relative max-w-content mx-auto px-8 pt-20 pb-16 grid items-center gap-14 max-sm:px-5 max-sm:pt-14 max-sm:pb-12 max-lg:gap-10 lg:grid-cols-[1.15fr_1fr]">
        {/* Left column — eyebrow, h1, lede, CTAs */}
        <div>
          <div className="stagger-1 flex items-center gap-3.5 mb-10 max-sm:mb-7">
            <span className="h-px flex-1" style={{ background: 'rgba(193, 72, 40, 0.4)' }} />
            <span className="type-label text-accent whitespace-nowrap">
              The Twenty-Second Year
            </span>
            <span className="h-px flex-1" style={{ background: 'rgba(193, 72, 40, 0.4)' }} />
          </div>

          <h1 className="stagger-2 type-display-1 mb-10 max-sm:mb-7">
            The pantry
            <br />
            for cafés, <em className="type-accent">kitchens</em>
            <br />
            <span
              className="font-display italic text-gold align-middle max-sm:text-[80px]"
              style={{ fontSize: '110px', lineHeight: 0.8, fontWeight: 300, letterSpacing: '-0.04em' }}
            >
              &amp;
            </span>
            &nbsp;home.
          </h1>

          <p
            className="stagger-3 type-body mb-10 max-w-[460px] pl-5 max-sm:mb-7"
            style={{
              backgroundImage:
                'linear-gradient(to bottom, var(--color-gold) 0%, transparent 100%)',
              backgroundSize: '1px 100%',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'left top',
            }}
          >
            Café-grade chai, cocoa, and smoothie concentrates — shipped direct from Carlsbad
            since 2003. The same bulk-bag pricing trusted by independent coffee shops across
            the country, now available to anyone who appreciates a proper cup.
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

        {/* Right column — hero image + stats strip */}
        <div className="flex flex-col gap-8 max-sm:gap-6">
          <div className="scale-in">
            <div
              className="relative overflow-hidden img-overlay-radial"
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
              <div className="absolute top-5 left-5 flex items-center gap-3 z-10">
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
                className="absolute bottom-5 left-5 z-10 type-label-sm text-gold-bright"
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
              <div className="absolute bottom-5 right-5 z-10 text-right">
                <p className="type-label-sm text-cream leading-tight">Carlsbad, CA 92009</p>
                <p className="type-label-sm text-cream/60 leading-tight mt-1">
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
                className="py-4 px-4 max-sm:px-2 flex flex-col items-start"
                style={{
                  borderLeft: i === 0 ? 'none' : '1px solid var(--rule)',
                }}
              >
                <span
                  className="font-display italic text-brand-deep"
                  style={{ fontSize: '28px', lineHeight: 1, letterSpacing: '-0.02em', fontWeight: 500 }}
                >
                  {stat.value}
                </span>
                <span
                  className="font-mono uppercase text-ink-muted mt-2"
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
