'use client';

import Image from 'next/image';
import { useState } from 'react';
import { bcImage } from '@/lib/bcImage';

export type GalleryImage = {
  url: string;
  alt_text: string | null;
};

type ProductGalleryProps = {
  images: GalleryImage[];
  productName: string;
  brandName: string | null;
  sku: string;
};

const CREAM_BG =
  'radial-gradient(ellipse at center, var(--color-cream) 0%, var(--color-paper-2) 115%)';

export function ProductGallery({ images, productName, brandName, sku }: ProductGalleryProps) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (images.length === 0) {
    return (
      <div
        className="relative aspect-square overflow-hidden img-overlay-radial"
        style={{ background: CREAM_BG, border: '1px solid var(--rule)' }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
          <span
            className="font-display italic text-brand-deep"
            style={{ fontSize: '28px', lineHeight: 1.15, letterSpacing: '-0.02em', fontWeight: 500 }}
          >
            {brandName ?? '—'}
          </span>
          <span
            className="font-mono uppercase text-ink-muted mt-4"
            style={{ fontSize: '10px', letterSpacing: '0.26em' }}
          >
            {sku}
          </span>
        </div>
      </div>
    );
  }

  const active = images[activeIdx] ?? images[0];

  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative aspect-square overflow-hidden img-overlay-radial"
        style={{ background: CREAM_BG, border: '1px solid var(--rule)' }}
      >
        <div className="absolute inset-0" style={{ padding: '32px' }}>
          <Image
            key={active.url}
            src={bcImage(active.url, 'hero')}
            alt={active.alt_text ?? productName}
            width={1200}
            height={1200}
            sizes="(min-width: 1024px) 60vw, 100vw"
            priority
            className="w-full h-full object-contain img-product"
          />
        </div>
      </div>

      {images.length > 1 && (
        <div
          className="flex gap-3 overflow-x-auto pb-1"
          style={{ scrollbarWidth: 'thin' }}
        >
          {images.map((img, i) => {
            const isActive = i === activeIdx;
            return (
              <button
                key={`${img.url}-${i}`}
                type="button"
                onClick={() => setActiveIdx(i)}
                aria-label={`View image ${i + 1} of ${images.length}`}
                aria-current={isActive ? 'true' : undefined}
                className="shrink-0 relative overflow-hidden transition-colors duration-300"
                style={{
                  width: 82,
                  height: 82,
                  background: CREAM_BG,
                  border: isActive
                    ? '1px solid var(--color-ink)'
                    : '1px solid var(--rule)',
                  cursor: 'pointer',
                  padding: 6,
                }}
              >
                <Image
                  src={bcImage(img.url, 'card')}
                  alt=""
                  width={160}
                  height={160}
                  sizes="82px"
                  className="w-full h-full object-contain img-product"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
