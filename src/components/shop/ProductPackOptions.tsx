'use client';

import { ProductImage } from './ProductImage';
import { bcImage } from '@/lib/bcImage';
import { isAvailableForPurchase } from '@/lib/product-availability';
import { getPackPricing, packSavingsForOption, primaryProductImage, type PackProduct } from '@/lib/product-pack-options';

export function ProductPackOptions({ options, selectedId, onSelect }: {
  options: PackProduct[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (options.length < 2) return null;

  return (
    <div className="pack-options" role="group" aria-label="Choose your size">
      <p className="pack-options-heading">Choose your size</p>
      <div className="pack-options-grid">
        {options.map((option) => {
          const pack = getPackPricing(option);
          if (!pack) return null;
          const primary = primaryProductImage(option);
          const savings = packSavingsForOption(option, options);
          const selected = selectedId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              className={`pack-option${selected ? ' is-selected' : ''}`}
              aria-pressed={selected}
            >
              {primary && (
                <span className="pack-option-image">
                  <ProductImage src={bcImage(primary.url, 'card')} alt="" sizes="64px" />
                </span>
              )}
              <span className="pack-option-copy">
                <span className="pack-option-label">{pack.sizeLabel}</span>
                <span className="pack-option-total">${Number(option.retail_price).toFixed(2)}</span>
                <span className="pack-unit-price">${pack.unitPrice.toFixed(2)} per {pack.label}</span>
                {savings !== null && savings > 0 && (
                    <span className="pack-option-saving">Save ${savings.toFixed(2)} vs. {pack.units} single {pack.pluralLabel}</span>
                )}
                {!isAvailableForPurchase(option.stock_status) && (
                  <span className="pack-option-unavailable">Out of stock</span>
                )}
              </span>
              <span className="pack-option-check" aria-hidden="true">{selected ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
