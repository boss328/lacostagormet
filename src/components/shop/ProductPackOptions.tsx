import Link from 'next/link';
import { ProductImage } from './ProductImage';
import { bcImage } from '@/lib/bcImage';
import { isAvailableForPurchase } from '@/lib/product-availability';
import { packSavingsPercent } from '@/lib/product-packs';
import { getPackPricing, primaryProductImage, type PackProduct } from '@/lib/product-pack-options';

export function ProductPackOptions({ options, selectedId }: { options: PackProduct[]; selectedId: string }) {
  if (options.length < 2) return null;
  const single = options.find((option) => option.units_per_pack === 1);

  return (
    <nav className="pack-options" aria-label="Choose your pack">
      <p className="pack-options-heading">Choose your pack</p>
      <div className="pack-options-grid">
        {options.map((option) => {
          const pack = getPackPricing(option);
          if (!pack) return null;
          const primary = primaryProductImage(option);
          const savings = single && single.pack_unit_label === option.pack_unit_label
            ? packSavingsPercent(Number(option.retail_price), pack.units, Number(single.retail_price))
            : null;
          const selected = selectedId === option.id;
          return (
            <Link
              key={option.id}
              href={`/product/${option.slug}/`}
              scroll={false}
              className={`pack-option${selected ? ' is-selected' : ''}`}
              aria-current={selected ? 'page' : undefined}
            >
              {primary && (
                <span className="pack-option-image">
                  <ProductImage src={bcImage(primary.url, 'card')} alt="" sizes="64px" />
                </span>
              )}
              <span className="pack-option-copy">
                <span className="pack-option-label">{pack.badge}</span>
                <span className="pack-option-total">${Number(option.retail_price).toFixed(2)}</span>
                <span className="pack-unit-price">${pack.unitPrice.toFixed(2)} per {pack.label}</span>
                {savings !== null && savings > 0 && (
                  <span className="pack-option-saving">Save {savings}% per {pack.label}</span>
                )}
                {!isAvailableForPurchase(option.stock_status) && (
                  <span className="pack-option-unavailable">Out of stock</span>
                )}
              </span>
              <span className="pack-option-check" aria-hidden="true">{selected ? '✓' : ''}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
