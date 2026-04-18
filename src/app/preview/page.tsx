import { notFound } from 'next/navigation';
import { Button } from '@/components/design-system/Button';
import { SectionHead } from '@/components/design-system/SectionHead';

export default function PreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="min-h-screen bg-paper px-8 py-24">
      <div className="max-w-content mx-auto">
        <p className="type-label text-accent mb-10">§ 0 · DEV-ONLY PREVIEW</p>

        <SectionHead
          numeral="I"
          eyebrow="Preview"
          title="Hello, {italic}world{/italic}."
          link={{ href: '/', label: 'Back home' }}
        />

        <div className="flex flex-wrap items-center gap-6 mb-24">
          <Button variant="solid" arrow>Shop the Catalog</Button>
          <Button variant="outline" arrow>View Brands</Button>
          <div className="bg-ink px-6 py-4">
            <Button variant="outline-gold" arrow>Talk to us</Button>
          </div>
        </div>

        <SectionHead
          numeral="II"
          eyebrow="Type Scale"
          title="Twelve brands, {italic}one roof{/italic}."
        />

        <div className="space-y-8 mb-24">
          <div>
            <p className="type-label-sm text-ink-muted mb-3">type-display-1 · 92/0.93 · Fraunces 400</p>
            <h1 className="type-display-1">Volume pricing, <em className="type-accent">reliable</em> supply.</h1>
          </div>
          <div>
            <p className="type-label-sm text-ink-muted mb-3">type-display-2 · 48/1.02</p>
            <h2 className="type-display-2">Shop by <em className="type-accent">category</em>.</h2>
          </div>
          <div>
            <p className="type-label-sm text-ink-muted mb-3">type-body · 17/1.65</p>
            <p className="type-body max-w-prose">
              La Costa Gourmet has been shipping café supplies out of Carlsbad, California
              since 2003. The same chai, cocoa and frappé bases the independents rely on —
              plus real people on the phone when you need them.
            </p>
          </div>
          <div className="flex items-baseline gap-8">
            <span className="type-numeral">XXII</span>
            <span className="type-brand">David Rio</span>
            <span className="type-price">$24<sup className="text-[13px] align-super ml-0.5">95</sup></span>
            <span className="type-product">Vanilla Chai Tea Latte · 3 lb bag</span>
          </div>
        </div>

        <SectionHead
          numeral="III"
          eyebrow="Token Swatches"
          title="Warm mercantile, {italic}no purple{/italic}."
        />

        <div className="grid grid-cols-4 gap-4 max-sm:grid-cols-2">
          {[
            { name: 'paper',        hex: '#F6EEDE', cls: 'bg-paper' },
            { name: 'paper-2',      hex: '#EDE2CB', cls: 'bg-paper-2' },
            { name: 'paper-3',      hex: '#E0D3B6', cls: 'bg-paper-3' },
            { name: 'cream',        hex: '#FCF6E8', cls: 'bg-cream' },
            { name: 'ink',          hex: '#1A110A', cls: 'bg-ink' },
            { name: 'ink-2',        hex: '#2E1F13', cls: 'bg-ink-2' },
            { name: 'ink-3',        hex: '#4A3722', cls: 'bg-ink-3' },
            { name: 'ink-muted',    hex: '#7A6448', cls: 'bg-ink-muted' },
            { name: 'brand',        hex: '#7A3B1B', cls: 'bg-brand' },
            { name: 'brand-deep',   hex: '#4E2410', cls: 'bg-brand-deep' },
            { name: 'brand-darker', hex: '#2E1205', cls: 'bg-brand-darker' },
            { name: 'accent',       hex: '#C14828', cls: 'bg-accent' },
            { name: 'gold',         hex: '#B88A48', cls: 'bg-gold' },
            { name: 'gold-bright',  hex: '#D4A961', cls: 'bg-gold-bright' },
            { name: 'forest',       hex: '#2A3F2A', cls: 'bg-forest' },
          ].map(({ name, hex, cls }) => (
            <div key={name} className="border border-rule">
              <div className={`h-20 ${cls}`} />
              <div className="p-3">
                <div className="type-label-sm text-ink">{name}</div>
                <div className="type-label-sm text-ink-muted mt-1">{hex}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
