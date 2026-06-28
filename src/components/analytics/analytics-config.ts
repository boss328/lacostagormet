// Shared analytics config + the production-only gate, so the base Google tag
// and the purchase-conversion event agree on the measurement ID and on exactly
// when analytics is active.
//
// IMPORTANT: this reads VERCEL_ENV, a SERVER-ONLY var. Import it from Server
// Components only (GoogleAnalytics, the order page). Never from a Client
// Component — there it would always resolve falsy.

// GA4 / Google Ads measurement ID. Public by design (ships in the page HTML),
// so a literal default is fine; NEXT_PUBLIC_GA_ID can override it per env.
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-B4NHR87PLC";

/**
 * True only on the real production deployment. Keeps localhost dev and Vercel
 * preview traffic out of GA / Ads data. Vercel sets VERCEL_ENV per deployment
 * target in BOTH the build and runtime environments, so this resolves
 * correctly whether a page is statically prerendered or dynamically rendered.
 * Evaluate in Server Components only.
 */
export function analyticsEnabled(): boolean {
  return process.env.VERCEL_ENV === "production" && Boolean(GA_ID);
}
