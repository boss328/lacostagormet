import Image, { type ImageProps } from 'next/image';
import type { ReactNode } from 'react';

type Props = Omit<ImageProps, 'src'> & {
  src: string | null | undefined;
  fallback: ReactNode;
};

/**
 * Renders `fallback` when `src` is null/empty (products without images,
 * category tiles without seeded imagery). Real BC CDN URLs are verified
 * at migration time, so runtime 404 handling isn't needed.
 */
export function ImageWithFallback({ src, fallback, ...imageProps }: Props) {
  if (!src) return <>{fallback}</>;
  return <Image {...imageProps} src={src} />;
}
