import Script from "next/script";
import { GA_ID, analyticsEnabled } from "./analytics-config";

/**
 * Google tag (gtag.js) — GA4 base install (measurement ID G-B4NHR87PLC).
 *
 * This wires the GA4 property only. Google Ads CONVERSION tracking is NOT set
 * up here — that needs either linking this GA4 property to the Google Ads
 * account and importing a `purchase` key event, or a separate AW- tag firing a
 * conversion event on the order-confirmation page (src/app/(shop)/order/
 * [orderNumber]). Neither can complete until a `purchase` event is emitted.
 *
 * Loaded ONLY on the real production deployment so localhost dev and Vercel
 * preview traffic never pollute analytics / Ads data. VERCEL_ENV is a
 * server-only var Vercel sets per deployment target in BOTH the build and
 * runtime environments — so the gate resolves correctly whether a page is
 * statically prerendered (VERCEL_ENV baked at build time) or dynamically
 * rendered per request. Note: NEXT_PUBLIC_GA_ID is inlined at build, so
 * changing it (or the gate) requires a redeploy — flipping the env var in the
 * dashboard alone won't update already-built HTML. To track every environment,
 * drop the VERCEL_ENV guard below.
 *
 * Soft navigations: the initial gtag('config') fires one page_view on hard
 * load; subsequent client-side route changes are counted by GA4 Enhanced
 * Measurement's "page changes based on browser history events" toggle (on by
 * default in the GA4 admin). If that toggle is ever turned off, in-app
 * navigations stop being counted — at which point wire an explicit
 * usePathname() effect that fires gtag('event', 'page_view').
 */
export function GoogleAnalytics() {
  if (!analyticsEnabled()) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
    </>
  );
}
