/**
 * Best-effort carrier detection from a tracking number string.
 *
 * Conservative — only reports a carrier when the format is unambiguous,
 * so we don't surface a wrong tracking link to the customer. Returns
 * null when the format is ambiguous; the email then ships without a
 * tracking-URL button.
 */

export type CarrierMatch = { carrier: string; trackingUrl: string };

export function detectCarrier(trackingRaw: string): CarrierMatch | null {
  const t = trackingRaw.trim().replace(/\s+/g, '');
  if (!t) return null;

  // FedEx — 12, 15, or 20 digits (Express / Ground / SmartPost variants).
  if (/^\d{12}$/.test(t) || /^\d{15}$/.test(t) || /^\d{20}$/.test(t)) {
    return {
      carrier: 'FedEx',
      trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`,
    };
  }

  // UPS — starts with 1Z, 16 chars total, alphanumeric.
  if (/^1Z[0-9A-Z]{16}$/.test(t)) {
    return {
      carrier: 'UPS',
      trackingUrl: `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`,
    };
  }

  // USPS — 20–22 digits, or 13-char "1234 5678 9012 3456 78 US" patterns.
  if (/^\d{20,22}$/.test(t) || /^[A-Z]{2}\d{9}US$/i.test(t)) {
    return {
      carrier: 'USPS',
      trackingUrl: `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${encodeURIComponent(t)}`,
    };
  }

  return null;
}
