'use client';
import { useRef, type ReactNode } from 'react';
export function FeaturedCarousel({
  children,
  count,
}: {
  children: ReactNode;
  count: number;
}) {
  const track = useRef<HTMLDivElement>(null);
  function move(direction: number) {
    track.current?.scrollBy({
      left: direction * track.current.clientWidth * 0.8,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
  return (
    <>
      <div
        ref={track}
        className="product-track"
        role="region"
        aria-label="Featured products"
        tabIndex={0}
      >
        {children}
      </div>
      <div className="carousel-bottom">
        <span>{count} featured favorites</span>
        <div className="carousel-controls">
          <button
            className="round-button"
            aria-label="Previous featured products"
            onClick={() => move(-1)}
          >
            ‹
          </button>
          <button
            className="round-button"
            aria-label="Next featured products"
            onClick={() => move(1)}
          >
            ›
          </button>
        </div>
      </div>
    </>
  );
}
