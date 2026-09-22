import Image from 'next/image';
import { productImageStyle } from '@/lib/product-image-framing';

/** Uniform square framing, preserving the source photo and all product artwork. */
export function ProductImage({
  src,
  alt,
  sizes,
  priority = false,
  className = '',
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <span className={`product-photo-frame ${className}`}>
      <Image
        src={src}
        alt={alt}
        width={1200}
        height={1200}
        sizes={sizes}
        priority={priority}
        style={{
          position: 'absolute',
          maxWidth: 'none',
          maxHeight: 'none',
          ...productImageStyle(src),
        }}
      />
    </span>
  );
}
