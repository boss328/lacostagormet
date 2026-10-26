'use client';

import { isAvailableForPurchase } from '@/lib/product-availability';
import { getPackPricing, type PackProduct } from '@/lib/product-pack-options';

export function ProductPackOptions({ options, selectedId, onSelect }: {
  options: PackProduct[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (options.length < 2) return null;

  return (
    <div className="pack-options" role="group" aria-label="Choose your size">
      <p className="pack-options-heading">Size</p>
      <div className="pack-options-grid">
        {options.map((option) => {
          const pack = getPackPricing(option);
          if (!pack) return null;
          const selected = selectedId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              className={`pack-option${selected ? ' is-selected' : ''}`}
              aria-pressed={selected}
            >
              <span>{pack.selectionLabel}</span>
              {!isAvailableForPurchase(option.stock_status) && (
                <span className="pack-option-unavailable">Out of stock</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
