export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-8 py-24 bg-paper text-ink">
      <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-accent mb-6">
        § 0 · Scaffold
      </p>
      <h1 className="font-display text-[72px] leading-[0.95] text-center max-w-3xl tracking-[-0.03em]">
        La Costa <span className="italic text-brand-deep">Gourmet</span>.
      </h1>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-muted mt-8">
        Est. MMIII &nbsp;·&nbsp; Carlsbad, California &nbsp;·&nbsp; Vol. XXII
      </p>
    </main>
  );
}
