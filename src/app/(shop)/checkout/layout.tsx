import Script from 'next/script';
import { acceptUiUrl, resolveAuthnetEnv } from '@/lib/authnet/environment';

/**
 * Loads AcceptUI.js for every route under /checkout. The script installs a
 * document-level click delegator on buttons with class="AcceptUI" and
 * exposes window.AcceptUI; both the delegator and the global are polled
 * for readiness by AcceptUIButton via waitForAcceptUI().
 *
 * Kept at layout level so future /checkout/review or /checkout/success
 * routes can share it. next/script strategy="afterInteractive" runs the
 * tag once hydration begins — early enough that the button's useEffect
 * poll resolves quickly.
 */

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  const env = resolveAuthnetEnv(process.env.NEXT_PUBLIC_AUTHNET_ENVIRONMENT);
  const src = acceptUiUrl(env);

  return (
    <>
      <Script src={src} strategy="afterInteractive" />
      {children}
    </>
  );
}
