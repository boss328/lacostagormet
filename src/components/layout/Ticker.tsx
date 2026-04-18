import { Fragment } from 'react';

type TickerProps = {
  items: string[];
};

export function Ticker({ items }: TickerProps) {
  if (items.length === 0) return null;

  // Duplicate the items once so the 40s linear loop (translateX 0 → -50%) seams invisibly.
  const doubled = [...items, ...items];

  return (
    <div
      className="bg-ink overflow-hidden"
      role="complementary"
      aria-label="Shop announcements"
    >
      <div className="ticker-track py-3.5">
        {doubled.map((item, i) => (
          <Fragment key={i}>
            <span className="type-label text-paper tracking-[0.2em] px-8 whitespace-nowrap">
              {item}
            </span>
            <span className="text-gold-bright text-[13px]" aria-hidden="true">
              ✺
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
