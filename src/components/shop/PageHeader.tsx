import Image from 'next/image';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

type Crumb = { href?: string; label: string };

type PageHeaderProps = {
  breadcrumb?: Crumb[];
  eyebrow: string;
  title: ReactNode;
  lede?: string;
  banner?: { src: string; alt: string };
};

export function PageHeader({ breadcrumb, eyebrow, title, lede, banner }: PageHeaderProps) {
  return (
    <>
      <header className="bg-cream border-b border-rule">
        <div className="max-w-content mx-auto px-8 pt-14 pb-16 max-sm:px-5 max-sm:pt-10 max-sm:pb-12">
          {breadcrumb && breadcrumb.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-2 mb-6 type-data-mono text-ink-muted"
            >
              {breadcrumb.map((c, i) => (
                <Fragment key={`${i}-${c.label}`}>
                  {c.href ? (
                    <Link
                      href={c.href}
                      className="hover:text-brand-deep transition-colors duration-200"
                    >
                      {c.label}
                    </Link>
                  ) : (
                    <span className="text-ink">{c.label}</span>
                  )}
                  {i < breadcrumb.length - 1 && (
                    <span aria-hidden="true" className="text-ink-muted/60">·</span>
                  )}
                </Fragment>
              ))}
            </nav>
          )}

          <p className="type-label text-accent mb-6">{eyebrow}</p>

          <h1 className="type-display-1 mb-8 max-w-[12ch] max-sm:max-w-none">
            {title}
          </h1>

          {lede && (
            <p
              className="type-body max-w-[620px] pl-5"
              style={{
                backgroundImage:
                  'linear-gradient(to bottom, var(--color-gold) 0%, transparent 100%)',
                backgroundSize: '1px 100%',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'left top',
              }}
            >
              {lede}
            </p>
          )}
        </div>
      </header>

      {banner && (
        <section
          aria-hidden="true"
          className="relative overflow-hidden img-overlay-radial"
          style={{ aspectRatio: '3 / 1' }}
        >
          <Image
            src={banner.src}
            alt={banner.alt}
            width={1600}
            height={533}
            sizes="100vw"
            priority
            className="img-hero w-full h-full object-cover"
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(to bottom, rgba(26, 17, 10, 0.05) 0%, rgba(26, 17, 10, 0.55) 100%)',
            }}
          />
        </section>
      )}
    </>
  );
}
