import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateShipping, SHIPPING_TIERS } from '@/lib/checkout/shipping';

/**
 * Canonical money math for checkout. Shipping rules use the 3-tier
 * structure in @/lib/checkout/shipping (Apr 2026 owner spec):
 *   $0–29.99   → $9.95
 *   $30–69.99  → $12.95
 *   $70+       → free (continental US)
 *
 * The shipping.* settings keys remain in the DB for the legacy
 * surcharge logic (HI/AK) and so admin UI can keep reading them, but
 * the tier table itself is hardcoded — owner committed to fixed
 * dollar amounts at the walkthrough.
 *
 * V1: zero tax. subtotal + shipping = total.
 */

export type ShippingSettings = {
  freeThreshold: number;
  flatRate: number;
  hiAkSurcharge: number;
};

const SETTING_KEYS = [
  'shipping.free_threshold',
  'shipping.flat_rate_under_threshold',
  'shipping.hi_ak_surcharge',
] as const;

const DEFAULT_SHIPPING: ShippingSettings = {
  freeThreshold: SHIPPING_TIERS.freeThreshold,
  flatRate: SHIPPING_TIERS.midRate,
  hiAkSurcharge: 25,
};

export async function loadShippingSettings(): Promise<ShippingSettings> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('settings')
    .select('key, value')
    .in('key', SETTING_KEYS as unknown as string[]);
  if (error) {
    console.error('[pricing] failed to load shipping settings, using defaults', error);
    return DEFAULT_SHIPPING;
  }
  const map = new Map<string, unknown>();
  for (const row of data ?? []) map.set(row.key as string, row.value);

  return {
    freeThreshold: asNumber(map.get('shipping.free_threshold'), DEFAULT_SHIPPING.freeThreshold),
    flatRate: asNumber(map.get('shipping.flat_rate_under_threshold'), DEFAULT_SHIPPING.flatRate),
    hiAkSurcharge: asNumber(map.get('shipping.hi_ak_surcharge'), DEFAULT_SHIPPING.hiAkSurcharge),
  };
}

function asNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function computeShipping(
  subtotal: number,
  state: string,
  settings: ShippingSettings = DEFAULT_SHIPPING,
): number {
  const s = state.trim().toUpperCase();
  const base = calculateShipping(subtotal);
  // HI/AK surcharge is added on top of whatever the tier rate is, so
  // those orders still pay something even when subtotal qualifies for
  // continental-US free shipping. The owner spec says HI/AK is "contact
  // for quote", but until that's wired we keep the surcharge so we
  // don't accidentally undercharge a Hawaiian order.
  if (s === 'HI' || s === 'AK') return round2(base + settings.hiAkSurcharge);
  return base;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function centsEqual(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}
