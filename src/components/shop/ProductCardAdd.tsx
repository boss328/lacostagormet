'use client';

import { useState, type MouseEvent } from 'react';
import { useCartStore, type CartItem } from '@/stores/cart';

type ProductCardAddProps = {
  item: Omit<CartItem, 'quantity'>;
};

export function ProductCardAdd({ item }: ProductCardAddProps) {
  const addItem = useCartStore((s) => s.addItem);
  const [state, setState] = useState<'idle' | 'added'>('idle');

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // The card is a <Link>; don't navigate — this is an in-place cart action.
    e.preventDefault();
    e.stopPropagation();
    addItem(item, 1);
    setState('added');
    setTimeout(() => setState('idle'), 1100);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Add ${item.name} to cart`}
      className="pc-add inline-flex items-center gap-1.5 font-mono uppercase"
      style={{
        fontSize: '10px',
        letterSpacing: '0.18em',
        padding: '9px 14px',
        border: '1px solid var(--color-ink)',
        lineHeight: 1,
        cursor: 'pointer',
      }}
    >
      <span>{state === 'added' ? 'Added' : 'Add'}</span>
      <span className="btn-arrow" aria-hidden="true" style={{ fontSize: '13px' }}>
        →
      </span>
    </button>
  );
}
