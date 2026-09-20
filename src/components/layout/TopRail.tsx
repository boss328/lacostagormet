import { isReadOnlyPreview } from '@/lib/preview-mode';
import Link from 'next/link';
import { SHIPPING_TIERS } from '@/lib/checkout/shipping';
export function TopRail() {
  return (
    <>
      {isReadOnlyPreview() && (
        <div className="preview-note">
          Review preview · Orders and messages are disabled
        </div>
      )}
      <div className="shipping-bar">
        Free ground shipping on orders ${SHIPPING_TIERS.freeThreshold}+.{' '}
        <span>Contiguous U.S.</span> <Link href="/shipping">Details ›</Link>
      </div>
    </>
  );
}
