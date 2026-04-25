/**
 * Shipping rate tiers — owner spec, Apr 2026 walkthrough.
 *
 *   Subtotal $0 – 29.99    →  $9.95
 *   Subtotal $30 – 69.99   →  $12.95
 *   Subtotal $70 +         →  free (continental US)
 *
 * Money handled in dollars to match the rest of the codebase. Edge
 * surcharges (HI/AK, international) are layered on top in
 * pricing.ts on the server side.
 */

export const SHIPPING_TIERS = {
  freeThreshold: 70,
  midThreshold: 30,
  midRate: 12.95,
  lowRate: 9.95,
} as const;

export function calculateShipping(subtotal: number): number {
  if (subtotal >= SHIPPING_TIERS.freeThreshold) return 0;
  if (subtotal >= SHIPPING_TIERS.midThreshold) return SHIPPING_TIERS.midRate;
  return SHIPPING_TIERS.lowRate;
}
