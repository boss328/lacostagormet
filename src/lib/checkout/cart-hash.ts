import { createHash } from 'crypto';

/**
 * Deterministic SHA-256 of a cart's content for idempotency.
 *
 * Normalisation: sort items by product_id ascending, convert unit price to
 * integer cents. This guarantees the same cart state always produces the
 * same hash regardless of client-side ordering.
 */

export type HashableItem = {
  product_id: string;
  quantity: number;
  unit_price: number;
};

export function cartHash(items: HashableItem[]): string {
  const normalised = items
    .map((i) => ({
      product_id: i.product_id,
      qty: i.quantity,
      unit_price_cents: Math.round(i.unit_price * 100),
    }))
    .sort((a, b) => (a.product_id < b.product_id ? -1 : a.product_id > b.product_id ? 1 : 0));
  return createHash('sha256').update(JSON.stringify(normalised)).digest('hex');
}
