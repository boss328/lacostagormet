import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

type SectionHeadProps = {
  numeral: string;
  eyebrow?: string;
  title: string;
  link?: { href: string; label: string };
  className?: string;
  id?: string;
};

/**
 * Parses `{italic}...{/italic}` tokens in the title and wraps each marked span
 * in the shared italic-accent treatment (brand-deep, -0.02em tracking).
 */
function renderTitle(title: string): ReactNode {
  const parts = title.split(/\{italic\}|\{\/italic\}/);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <em key={i} className="type-accent">{part}</em>
      : <Fragment key={i}>{part}</Fragment>,
  );
}

export function SectionHead({ numeral, eyebrow, title, link, className = '', id }: SectionHeadProps) {
  const base = 'grid grid-cols-[auto_1fr_auto] items-baseline gap-8 pb-5 mb-11 border-b border-rule max-sm:grid-cols-1 max-sm:gap-3';
  return (
    <header id={id} className={`${base}${className ? ' ' + className : ''}`}>
      <div className="flex items-baseline gap-4 max-sm:gap-3">
        <span className="type-numeral" aria-hidden="true">{numeral}</span>
        <span className="type-label text-ink-muted">§&nbsp;&nbsp;{eyebrow ?? ''}</span>
      </div>
      <h2 className="type-display-2 max-sm:col-start-1">
        {renderTitle(title)}
      </h2>
      {link && (
        <Link
          href={link.href}
          className="type-label text-ink hover:text-brand-deep transition-colors duration-300 max-sm:col-start-1 max-sm:justify-self-start"
        >
          {link.label}&nbsp;→
        </Link>
      )}
    </header>
  );
}
