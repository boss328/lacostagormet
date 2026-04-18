import Link from 'next/link';
import { ImageWithFallback } from '@/components/shop/ImageWithFallback';

export type CategoryTileData = {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  itemCount: number;
};

type CategoryTileProps = {
  category: CategoryTileData;
  image: { src: string; alt: string };
  index: number;
};

function pad2(n: number) {
  return n.toString().padStart(2, '0');
}

export function CategoryTile({ category, image, index }: CategoryTileProps) {
  return (
    <Link href={`/shop/${category.slug}`} className="category-tile group">
      <div className="relative overflow-hidden img-overlay-radial" style={{ height: '160px' }}>
        <ImageWithFallback
          src={image.src}
          alt={image.alt}
          width={600}
          height={600}
          sizes="(min-width: 1024px) 220px, (min-width: 640px) 33vw, 50vw"
          className="category-tile-img w-full h-full object-cover"
          fallback={
            <div
              className="w-full h-full flex flex-col items-center justify-center px-4 text-center"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-paper-2) 0%, var(--color-paper-3) 100%)',
              }}
            >
              <span
                className="font-display italic text-brand-deep"
                style={{ fontSize: '20px', lineHeight: 1.1, letterSpacing: '-0.01em', fontWeight: 500 }}
              >
                {category.name}
              </span>
              <span
                className="font-mono uppercase text-ink-muted mt-2"
                style={{ fontSize: '9px', letterSpacing: '0.24em' }}
              >
                {category.itemCount} {category.itemCount === 1 ? 'item' : 'items'}
              </span>
            </div>
          }
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(26, 17, 10, 0.55) 100%)' }}
          aria-hidden="true"
        />
      </div>
      <div className="bg-cream" style={{ padding: '16px 16px 20px' }}>
        <p className="type-label-sm text-ink-muted mb-1.5">№&nbsp;{pad2(index + 1)}</p>
        <p
          className="font-display italic text-brand-deep mb-1.5"
          style={{ fontSize: '18px', lineHeight: 1.1, letterSpacing: '-0.01em', fontWeight: 500 }}
        >
          {category.name}
        </p>
        <p className="type-label-sm text-accent">
          {category.itemCount} {category.itemCount === 1 ? 'item' : 'items'}
        </p>
      </div>
    </Link>
  );
}
