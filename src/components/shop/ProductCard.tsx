import Link from 'next/link';
import { ImageWithFallback } from '@/components/shop/ImageWithFallback';
import { bcImage } from '@/lib/bcImage';
import { formatPackSize } from '@/lib/pack-size';

type ProductImage = {
  url: string;
  alt_text: string | null;
  is_primary: boolean;
  display_order: number;
};

export type ProductCardData = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  pack_size: string | null;
  retail_price: number | string;
  brands?: { name: string; slug: string } | null;
  product_images?: ProductImage[] | null;
};

type ProductCardProps = {
  product: ProductCardData;
  showJustIn?: boolean;
  priority?: boolean;
};

function pickPrimary(images: ProductImage[] | null | undefined): ProductImage | null {
  if (!images || images.length === 0) return null;
  return (
    images.find((i) => i.is_primary) ??
    [...images].sort((a, b) => a.display_order - b.display_order)[0]
  );
}

function splitPrice(v: number | string): { dollars: string; cents: string } {
  const n = typeof v === 'string' ? Number(v) : v;
  const [d, c = '00'] = n.toFixed(2).split('.');
  return { dollars: d, cents: c.padEnd(2, '0').slice(0, 2) };
}

export function ProductCard({ product, showJustIn = false, priority = false }: ProductCardProps) {
  const img = pickPrimary(product.product_images);
  const imgUrl = img ? bcImage(img.url, 'card') : null;
  const { dollars, cents } = splitPrice(product.retail_price);

  return (
    <Link href={`/product/${product.slug}`} className="product-card group">
      <div
        className="relative aspect-square overflow-hidden"
        style={{
          background:
            'radial-gradient(ellipse at center, var(--color-cream) 0%, var(--color-paper-2) 115%)',
        }}
      >
        {showJustIn && (
          <span
            className="absolute top-3.5 left-3.5 z-10 bg-accent text-cream font-mono uppercase"
            style={{
              fontSize: '9px',
              letterSpacing: '0.2em',
              padding: '5px 10px',
              lineHeight: 1,
            }}
          >
            Just In
          </span>
        )}
        <span
          className="absolute top-3.5 right-3.5 z-10 font-mono uppercase text-gold-bright"
          style={{
            fontSize: '9px',
            letterSpacing: '0.24em',
            padding: '4px 9px',
            background: 'rgba(26, 17, 10, 0.72)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            lineHeight: 1,
          }}
        >
          {product.sku}
        </span>
        <div className="absolute inset-0" style={{ padding: '18px' }}>
          <ImageWithFallback
            src={imgUrl}
            alt={product.name}
            width={600}
            height={600}
            sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw"
            priority={priority}
            className="product-card-img w-full h-full object-contain img-product"
            fallback={
              <div className="w-full h-full flex flex-col items-center justify-center text-center">
                <span
                  className="font-display italic text-brand-deep"
                  style={{ fontSize: '20px', lineHeight: 1.15, letterSpacing: '-0.01em', fontWeight: 500 }}
                >
                  {product.brands?.name ?? '—'}
                </span>
                <span
                  className="font-mono uppercase text-ink-muted mt-3"
                  style={{ fontSize: '9px', letterSpacing: '0.24em' }}
                >
                  {product.sku}
                </span>
              </div>
            }
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col" style={{ padding: '18px' }}>
        <div
          className="flex items-baseline justify-between gap-3 pb-2 mb-2.5"
          style={{ borderBottom: '1px solid var(--rule)' }}
        >
          <span className="type-label-sm text-ink-muted truncate min-w-0">
            {product.brands?.name ?? '—'}
          </span>
          <span className="type-label-sm text-brand truncate min-w-0">
            {formatPackSize(product.pack_size) ?? '—'}
          </span>
        </div>
        <p className="type-product flex-1 mb-4">{product.name}</p>
        <div
          className="flex items-center justify-between gap-3"
          style={{ paddingTop: '12px', borderTop: '1px dashed var(--rule)' }}
        >
          <span className="type-price">
            ${dollars}
            <sup
              className="font-display"
              style={{ fontSize: '13px', color: 'var(--color-ink-muted)', marginLeft: '2px', verticalAlign: 'super' }}
            >
              {cents}
            </sup>
          </span>
          <span
            className="pc-add inline-flex items-center gap-1.5 font-mono uppercase"
            style={{
              fontSize: '10px',
              letterSpacing: '0.18em',
              padding: '9px 14px',
              border: '1px solid var(--color-ink)',
              lineHeight: 1,
            }}
          >
            <span>Add</span>
            <span className="btn-arrow" aria-hidden="true" style={{ fontSize: '13px' }}>→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
