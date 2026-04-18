import Link from 'next/link';
import { brandTypology } from '@/lib/brand-meta';

export type BrandRowData = {
  id: string;
  name: string;
  slug: string;
  itemCount: number;
};

type BrandRowProps = {
  brand: BrandRowData;
};

export function BrandRow({ brand }: BrandRowProps) {
  const typology = brandTypology(brand.slug);

  return (
    <Link href={`/brand/${brand.slug}`} className="brand-row group">
      <p className="type-brand mb-3" style={{ lineHeight: 1.15 }}>
        {brand.name}
      </p>
      <div className="flex items-center justify-between gap-4">
        <span
          className="font-mono uppercase text-ink-muted truncate"
          style={{ fontSize: '10px', letterSpacing: '0.14em' }}
        >
          {typology}
        </span>
        <span
          className="font-mono uppercase text-accent whitespace-nowrap"
          style={{ fontSize: '10px', letterSpacing: '0.14em' }}
        >
          {brand.itemCount}{' '}
          <span className="text-ink-muted">
            {brand.itemCount === 1 ? 'item' : 'items'}
          </span>
        </span>
      </div>
    </Link>
  );
}
