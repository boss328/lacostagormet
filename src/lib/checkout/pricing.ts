import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Canonical money math for checkout. Shipping rules are driven by
 * settings rows (shipping.free_threshold, shipping.flat_rate_under_threshold,
 * shipping.hi_ak_surcharge) so Jeff can tune them without a deploy.
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
  freeThreshold: 70,
  flatRate: 12.99,
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
  if (s === 'HI' || s === 'AK') return round2(settings.flatRate + settings.hiAkSurcharge);
  if (subtotal >= settings.freeThreshold) return 0;
  return round2(settings.flatRate);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function centsEqual(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}
