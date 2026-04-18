import Image from 'next/image';
import { STORY_IMAGE } from '@/lib/placeholder-images';

export function HomeStory() {
  return (
    <section className="relative bg-ink text-paper overflow-hidden">
      {/* Layered radial + subtle scan lines for depth */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 15% 90%, rgba(184, 138, 72, 0.22) 0%, transparent 55%), ' +
            'radial-gradient(circle at 85% 10%, rgba(193, 72, 40, 0.10) 0%, transparent 45%)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(246, 238, 222, 0.015) 0px, rgba(246, 238, 222, 0.015) 1px, transparent 1px, transparent 3px)',
        }}
      />

      <div className="relative max-w-content mx-auto px-8 py-24 max-sm:px-5 max-sm:py-16 grid gap-16 items-center max-lg:gap-10 lg:grid-cols-[1fr_1.15fr]">
        {/* Left — photo */}
        <div
          className="relative"
          style={{ aspectRatio: '3 / 4', border: '1px solid rgba(246, 238, 222, 0.24)' }}
        >
          <Image
            src={STORY_IMAGE.src}
            alt={STORY_IMAGE.alt}
            width={600}
            height={800}
            sizes="(min-width: 1024px) 520px, 100vw"
            className="img-story w-full h-full object-cover"
          />
          <div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-3"
            style={{
              padding: '14px 16px',
              background: 'rgba(26, 17, 10, 0.78)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              borderTop: '1px solid rgba(212, 169, 97, 0.35)',
            }}
          >
            <span className="type-label-sm text-gold-bright">The Dispatch Desk</span>
            <span className="type-label-sm text-cream/70">Carlsbad · MMXXVI</span>
          </div>
        </div>

        {/* Right — story body */}
        <div>
          <div
            className="inline-flex items-center gap-2 mb-8 font-mono uppercase text-gold-bright"
            style={{
              fontSize: '10px',
              letterSpacing: '0.26em',
              padding: '6px 12px',
              border: '1px solid var(--color-gold-bright)',
            }}
          >
            <span aria-hidden="true">✺</span>
            Est. MMIII · № 0001
          </div>

          <h3 className="type-display-3 mb-10 max-sm:mb-7">
            Twenty-two years
            <br />
            of the <em className="type-accent-gold">same</em>
            <br />
            promise.
          </h3>

          <p
            className="font-display text-paper/85 mb-7"
            style={{ fontSize: '17px', lineHeight: 1.7 }}
          >
            <span className="drop-cap-w" aria-hidden="true">W</span>
            <span className="sr-only">W</span>e started out of a garage in 2003 with one
            goal — to bring café-grade chai, cocoa, and smoothie bases into homes and smaller
            businesses at pricing that independents could actually afford.
          </p>
          <p
            className="font-display text-paper/70 mb-10"
            style={{ fontSize: '17px', lineHeight: 1.7 }}
          >
            Two decades later, we&apos;re still family-owned. Still shipping from California.
            Still answering the phone ourselves. The brands you know and trust, delivered by
            people who remember your name.
          </p>

          <div
            className="flex items-baseline justify-between gap-4 pt-6"
            style={{ borderTop: '1px solid rgba(246, 238, 222, 0.2)' }}
          >
            <div>
              <span
                className="font-display italic text-paper"
                style={{ fontSize: '18px', letterSpacing: '-0.01em' }}
              >
                — Jeff Duben
              </span>
              <span className="type-label-sm text-cream/60">,&nbsp;&nbsp;Founder</span>
            </div>
            <span className="type-label-sm text-gold-bright">Dispatch № MMXXVI</span>
          </div>
        </div>
      </div>
    </section>
  );
}
