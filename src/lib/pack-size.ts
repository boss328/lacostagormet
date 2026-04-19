/**
 * Transform human-written pack_size strings into compact product-card notation.
 * DB keeps the verbose form ("Five 3.5 lb. Bags") for admin/spec UIs; cards
 * render the compact form ("5 × 3.5 lb").
 *
 * Patterns covered (case-insensitive, tolerant of spacing + vessel suffixes):
 *   "Five 3.5 lb. Bags"     → "5 × 3.5 lb"
 *   "Six 46 Oz. Bottles"    → "6 × 46 oz"
 *   "Six 11.9 Oz Canisters" → "6 × 11.9 oz"
 *   "Twelve 14 Oz. Cans"    → "12 × 14 oz"
 *   "11.9 Oz Can"           → "11.9 oz"
 *   "Case of Twelve"        → "Case of 12"
 *   "12 Pack"               → "12 pack"
 * Anything that doesn't match: returned as-is.
 */

const COUNT_WORDS: Record<string, string> = {
  two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12',
};

const COUNT_TOKEN = '(?:Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|\\d+)';
const UNIT        = '(?:lb|oz|kg|g)';
const VESSEL      = '(?:Bags?|Cans?|Canisters?|Bottles?|Pouches?|Containers?|Cartons?|Jugs?|Packs?|Boxes?)';

const MULTI_RE  = new RegExp(`^\\s*(${COUNT_TOKEN})\\s+([\\d.]+)\\s*(${UNIT})\\.?\\s*${VESSEL}?\\s*$`, 'i');
const SINGLE_RE = new RegExp(`^\\s*([\\d.]+)\\s*(${UNIT})\\.?\\s*${VESSEL}?\\s*$`, 'i');
const CASE_OF   = new RegExp(`^\\s*case of\\s+(${COUNT_TOKEN})\\s*$`, 'i');
const N_PACK    = /^\s*(\d+)\s*pack\s*$/i;

function resolveCount(token: string): string {
  return COUNT_WORDS[token.toLowerCase()] ?? token;
}

export function formatPackSize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();

  let m = s.match(MULTI_RE);
  if (m) return `${resolveCount(m[1])} × ${m[2]} ${m[3].toLowerCase()}`;

  m = s.match(SINGLE_RE);
  if (m) return `${m[1]} ${m[2].toLowerCase()}`;

  m = s.match(CASE_OF);
  if (m) return `Case of ${resolveCount(m[1])}`;

  m = s.match(N_PACK);
  if (m) return `${m[1]} pack`;

  return s;
}
