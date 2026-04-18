import { Fragment, type ReactNode } from 'react';

/**
 * Renders a page/section headline with brand-deep italic accent treatment.
 *
 * Rules:
 *   - Single token  ("Cocoa")           → whole word italic
 *   - "X & Y" names ("Teas & Chai")     → both sides italic, ampersand stays roman
 *   - Multi-word    ("Smoothie Bases")  → last token italic, prior tokens roman
 *
 * The `className` prop controls which accent colour to use (`type-accent` for
 * light backgrounds, `type-accent-gold` for dark).
 */
export function italicLastWord(text: string, className = 'type-accent'): ReactNode {
  // Strip trailing punctuation so the period lives outside the <em>.
  const punctMatch = text.match(/[.!?]+$/);
  const punct = punctMatch ? punctMatch[0] : '';
  const core = punct ? text.slice(0, -punct.length).trimEnd() : text;

  const ampersand = /\s*&\s*/;

  if (ampersand.test(core)) {
    const [left, right] = core.split(ampersand);
    return (
      <>
        <em className={className}>{left}</em> &amp; <em className={className}>{right}</em>
        {punct}
      </>
    );
  }

  const tokens = core.trim().split(/\s+/);
  if (tokens.length === 1) {
    return (
      <>
        <em className={className}>{core}</em>
        {punct}
      </>
    );
  }

  const last = tokens[tokens.length - 1];
  const prefix = tokens.slice(0, -1).join(' ');
  return (
    <>
      {prefix}
      {' '}
      <em className={className}>{last}</em>
      {punct}
    </>
  );
}

/** Re-export for readers who want the Fragment directly. */
export { Fragment };
