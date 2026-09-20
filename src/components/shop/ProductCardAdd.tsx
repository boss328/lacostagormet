'use client';
import { useEffect, useRef, useState } from 'react';
import { useCartStore, type CartItem } from '@/stores/cart';
export function ProductCardAdd({ item }: { item: Omit<CartItem, 'quantity'> }) {
  const addItem = useCartStore((s) => s.addItem);
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className="pc-add"
      aria-label={
        added ? `${item.name} added to cart` : `Add ${item.name} to cart`
      }
      onClick={() => {
        addItem(item, 1);
        setAdded(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setAdded(false), 1600);
      }}
    >
      <span aria-live="polite">{added ? 'Added ✓' : 'Add to cart'}</span>
    </button>
  );
}
