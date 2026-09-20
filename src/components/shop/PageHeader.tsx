import Image from 'next/image';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
type Crumb = { href?: string; label: string };
export function PageHeader({
  breadcrumb,
  eyebrow,
  title,
  lede,
  banner,
}: {
  breadcrumb?: Crumb[];
  eyebrow: string;
  title: ReactNode;
  lede?: string;
  banner?: { src: string; alt: string };
}) {
  return (
    <header className="page-header">
      <div className="wrap">
        {breadcrumb?.length ? (
          <nav aria-label="Breadcrumb" className="breadcrumbs">
            {breadcrumb.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && <span aria-hidden="true">/</span>}
                {c.href ? (
                  <Link href={c.href}>{c.label}</Link>
                ) : (
                  <span aria-current="page">{c.label}</span>
                )}
              </Fragment>
            ))}
          </nav>
        ) : null}
        <div className="page-header-content">
          <div>
            <p className="eyebrow">{eyebrow.replace(/[·]/g, '').trim()}</p>
            <h1>{title}</h1>
            {lede && <p className="page-lede">{lede}</p>}
          </div>
          {banner && (
            <Image
              src={banner.src}
              alt={banner.alt}
              width={240}
              height={240}
              className="page-category-image"
              priority
            />
          )}
        </div>
      </div>
    </header>
  );
}
