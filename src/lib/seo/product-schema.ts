/**
 * Shared helpers for the two places we describe products to Google:
 * the Merchant Center feed (/api/google-feed.xml) and the JSON-LD on
 * product pages (ProductJsonLd). Both must agree on identifiers,
 * availability, and description text — if the feed and the crawled
 * page disagree, Merchant Center disapproves the item.
 */

/**
 * Returns the digits of a valid GTIN (8 / 12 / 13 / 14 digits with a
 * correct mod-10 check digit), or null. UPCs in the catalog are
 * free-form text and ~15 of them are ASINs or mistyped digits — those
 * must ship as mpn + identifier_exists=no rather than as a bad gtin,
 * which Google hard-rejects.
 */
export function validGtin(raw: unknown): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(d.length)) return null;
  const digits = d.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // GS1 mod-10: weights alternate 3,1 right-to-left from the digit
  // before the check digit.
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += digits[i] * w;
  }
  return (10 - (sum % 10)) % 10 === check ? d : null;
}

/**
 * stock_status ('in_stock' | 'low_stock' | 'out_of_stock' |
 * 'discontinued') → Google availability. Discontinued items that are
 * still active sell out, not disappear.
 */
export function googleAvailability(
  stockStatus: string | null | undefined,
): 'in_stock' | 'out_of_stock' {
  return stockStatus === 'out_of_stock' || stockStatus === 'discontinued'
    ? 'out_of_stock'
    : 'in_stock';
}

/**
 * Product descriptions are HTML (BigCommerce migration). Google wants
 * plain text in both the feed and JSON-LD; tags stripped, the handful
 * of entities BC actually emits decoded, whitespace collapsed.
 */
export function plainTextDescription(html: string | null | undefined): string {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Orders a product_images join the same way the gallery does:
 * primary first, then display_order.
 */
export function sortProductImages<
  T extends { url: string; is_primary: boolean; display_order: number },
>(raw: T[] | null | undefined): T[] {
  if (!raw || raw.length === 0) return [];
  return [...raw].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return a.display_order - b.display_order;
  });
}
