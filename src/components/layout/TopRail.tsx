export function TopRail() {
  return (
    <div
      className="bg-ink text-paper px-8 max-sm:px-5 py-[9px]"
      style={{ borderBottom: '1px solid rgba(212, 169, 97, 0.15)' }}
    >
      <div className="max-w-content mx-auto grid grid-cols-[auto_1fr_auto] items-center gap-8 max-sm:grid-cols-[1fr_auto] max-sm:gap-4">
        <span className="type-label-sm text-paper/80 whitespace-nowrap">
          Est. MMIII — Carlsbad, California
        </span>
        <span className="type-label-sm text-paper/80 justify-self-center whitespace-nowrap max-sm:hidden flex items-center gap-3">
          Family Owned
          <span className="text-gold-bright" aria-hidden="true">●</span>
          Made in U.S.A.
          <span className="text-gold-bright" aria-hidden="true">●</span>
          Ships Weekdays
        </span>
        <span className="type-label-sm text-gold-bright whitespace-nowrap justify-self-end">
          №&nbsp;0042 · Vol. XXII
        </span>
      </div>
    </div>
  );
}
