'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AddressPayload } from '@/lib/checkout/validate';
import { calculateShipping, SHIPPING_TIERS } from '@/lib/checkout/shipping';

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

/**
 * Reorder session — ephemeral context attached when the customer or
 * admin clicks Reorder on a past order. Lives alongside `items` so the
 * existing checkout flow can pick it up without a new state machine.
 *
 *   prefillAddress     — shipping address from the source order, in
 *                        AddressPayload (camelCase) shape. The new
 *                        /cart/confirm-address page seeds its form
 *                        from this; CheckoutForm reads it on mount as
 *                        a fallback if the user skipped confirm-address.
 *   unavailableNotice  — names of items the source order had that
 *                        couldn't be re-added (SKU not in the current
 *                        catalogue, or product inactive). Banner on
 *                        /cart shows these to the user.
 *   sourceOrderNumber  — for context strings only (e.g. "Reordering
 *                        from LCG-12345").
 */
export type ReorderSession = {
  prefillAddress: AddressPayload | null;
  unavailableNotice: string[] | null;
  sourceOrderNumber: string | null;
};

type ReorderItemPayload = Omit<CartItem, 'quantity'> & { quantity: number };

type CartState = {
  items: CartItem[];
  reorder: ReorderSession;
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeItem: (product_id: string) => void;
  updateQuantity: (product_id: string, quantity: number) => void;
  clear: () => void;
  hydrateFromReorder: (input: {
    items: ReorderItemPayload[];
    address: AddressPayload | null;
    unavailable: string[];
    sourceOrderNumber: string;
    replace?: boolean;
  }) => void;
  setPrefillAddress: (address: AddressPayload | null) => void;
  consumePrefillAddress: () => AddressPayload | null;
  dismissUnavailableNotice: () => void;
};

const EMPTY_REORDER: ReorderSession = {
  prefillAddress: null,
  unavailableNotice: null,
  sourceOrderNumber: null,
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      reorder: EMPTY_REORDER,
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
      clear: () => set({ items: [], reorder: EMPTY_REORDER }),

      hydrateFromReorder: ({ items, address, unavailable, sourceOrderNumber, replace = true }) =>
        set((state) => {
          // `replace: true` is the default — wiping the cart matches the
          // user's mental model of "reorder = start fresh from this order".
          // Callers can pass false to merge (admin scenario where the rep
          // is staging multiple reorders for one customer).
          const base = replace ? [] : [...state.items];
          for (const it of items) {
            const existing = base.find((b) => b.product_id === it.product_id);
            if (existing) {
              existing.quantity += it.quantity;
            } else {
              base.push({ ...it });
            }
          }
          return {
            items: base,
            reorder: {
              prefillAddress: address,
              unavailableNotice: unavailable.length > 0 ? unavailable : null,
              sourceOrderNumber,
            },
          };
        }),

      setPrefillAddress: (address) =>
        set((state) => ({ reorder: { ...state.reorder, prefillAddress: address } })),

      // CheckoutForm calls this on mount to seed its address state and
      // immediately clear the prefill so a back-button into checkout
      // doesn't keep re-pre-filling stale data after the user edits.
      consumePrefillAddress: () => {
        const addr = get().reorder.prefillAddress;
        if (addr) {
          set((state) => ({ reorder: { ...state.reorder, prefillAddress: null } }));
        }
        return addr;
      },

      dismissUnavailableNotice: () =>
        set((state) => ({ reorder: { ...state.reorder, unavailableNotice: null } })),
    }),
    {
      name: 'lcg-cart-v1',
      storage: createJSONStorage(() => localStorage),
      // v2 wiped Phase 4/5 test carts (non-UUID product_ids).
      // v3 widens the persisted shape to include the reorder session.
      // Older stored carts get re-initialised to an empty cart on load.
      version: 3,
      migrate: (persisted: unknown, fromVersion) => {
        // Anything stored before v3 lacks the reorder field. Wrap it so
        // the new structure validates.
        if (fromVersion < 3 && persisted && typeof persisted === 'object') {
          return { ...(persisted as object), reorder: EMPTY_REORDER };
        }
        return persisted as CartState;
      },
    },
  ),
);

export const selectSubtotal = (s: CartState): number =>
  s.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

export const selectItemCount = (s: CartState): number =>
  s.items.reduce((sum, i) => sum + i.quantity, 0);

export const FREE_SHIPPING_THRESHOLD = SHIPPING_TIERS.freeThreshold;
export const VOLUME_TIER_1_THRESHOLD = 400;
export const VOLUME_TIER_2_THRESHOLD = 700;

export const selectShipping = (s: CartState): number => {
  if (s.items.length === 0) return 0;
  return calculateShipping(selectSubtotal(s));
};

export const selectTotal = (s: CartState): number =>
  selectSubtotal(s) + selectShipping(s);

export const selectQualifiesForFreeShipping = (s: CartState): boolean =>
  selectSubtotal(s) >= FREE_SHIPPING_THRESHOLD;

export const selectMeetsVolumeThreshold = (s: CartState): boolean =>
  selectSubtotal(s) >= VOLUME_TIER_1_THRESHOLD;

export const selectMeetsHigherThreshold = (s: CartState): boolean =>
  selectSubtotal(s) >= VOLUME_TIER_2_THRESHOLD;
