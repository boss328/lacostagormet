'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type CartItem = {
  product_id: string;
  sku: string;
  name: string;
  slug: string;
  brand_name: string | null;
  price: number;
  pack_size: string | null;
  image_url: string | null;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeItem: (product_id: string) => void;
  updateQuantity: (product_id: string, quantity: number) => void;
  clear: () => void;
};

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find((i) => i.product_id === item.product_id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.product_id === item.product_id
                  ? { ...i, quantity: i.quantity + quantity }
                  : i,
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity }] };
        }),
      removeItem: (product_id) =>
        set((state) => ({ items: state.items.filter((i) => i.product_id !== product_id) })),
      updateQuantity: (product_id, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i.product_id !== product_id)
              : state.items.map((i) =>
                  i.product_id === product_id ? { ...i, quantity } : i,
                ),
        })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'lcg-cart-v1',
      storage: createJSONStorage(() => localStorage),
      // Bumped 1 → 2 to wipe carts populated during Phase 4/5 test iterations
      // that may contain items with non-UUID product_id. Zustand's persist
      // middleware sees the version mismatch and starts empty; current code
      // only ever writes UUIDs so fresh carts are valid.
      version: 2,
    },
  ),
);

export const selectSubtotal = (s: CartState): number =>
  s.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

export const selectItemCount = (s: CartState): number =>
  s.items.reduce((sum, i) => sum + i.quantity, 0);

export const FREE_SHIPPING_THRESHOLD = 70;
export const VOLUME_TIER_1_THRESHOLD = 400;
export const VOLUME_TIER_2_THRESHOLD = 700;

export const selectQualifiesForFreeShipping = (s: CartState): boolean =>
  selectSubtotal(s) >= FREE_SHIPPING_THRESHOLD;

export const selectMeetsVolumeThreshold = (s: CartState): boolean =>
  selectSubtotal(s) >= VOLUME_TIER_1_THRESHOLD;

export const selectMeetsHigherThreshold = (s: CartState): boolean =>
  selectSubtotal(s) >= VOLUME_TIER_2_THRESHOLD;
