'use client';

import Image, { type ImageProps } from 'next/image';
import { useState, type ReactNode } from 'react';

type Props = Omit<ImageProps, 'src'> & {
  src: string | null | undefined;
  fallback: ReactNode;
};

/**
 * Wraps next/image with an `onError` swap. Renders `fallback` when:
 *   - `src` is null/empty (no image on the product/category row), or
 *   - the image load fails at runtime (e.g. BC CDN URLs that don't resolve
 *     from the CSV-derived path — see 08.2 progress for context).
 *
 * Server-side render always emits the <Image> when `src` is truthy; fallback
 * takes over on the client if onError fires.
 */
export function ImageWithFallback({ src, fallback, ...imageProps }: Props) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return <>{fallback}</>;
  }

  return (
    <Image
      {...imageProps}
      src={src}
      onError={() => setErrored(true)}
    />
  );
}
