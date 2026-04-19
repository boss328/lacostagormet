'use client';

/**
 * AcceptUI integration — hosted iframe popup.
 *
 * Card data stays inside Auth.net's iframe and is never touched by our DOM
 * or our server. Client receives an opaque token (dataDescriptor + dataValue)
 * on success.
 *
 * Integration pattern in React:
 *
 *   1. Load AcceptUI.js once via <Script> in the checkout route layout
 *      (src/app/(shop)/checkout/layout.tsx).
 *   2. Call waitForAcceptUI() from a client component's useEffect to flip
 *      a `ready` state once window.AcceptUI is defined.
 *   3. Assign window-scoped response trampolines via bindAcceptHandlers()
 *      that forward to React refs (stable binding, fresh closure).
 *   4. Render a <button className="AcceptUI" data-...> — AcceptUI.js
 *      event-delegates clicks on that class to open the hosted iframe.
 */

export type AcceptJsSuccess = {
  opaqueData: { dataDescriptor: string; dataValue: string };
  messages: { resultCode: 'Ok'; message: Array<{ code: string; text: string }> };
  customerInformation?: { firstName?: string; lastName?: string };
  encryptedData?: { cardNumber?: string; expDate?: string };
};

export type AcceptJsError = {
  messages: { resultCode: 'Error'; message: Array<{ code: string; text: string }> };
};

export type AcceptJsResponse = AcceptJsSuccess | AcceptJsError;

export function isAcceptJsSuccess(r: AcceptJsResponse): r is AcceptJsSuccess {
  return r.messages.resultCode === 'Ok';
}

/**
 * Polls for window.AcceptUI availability. AcceptUI.js is loaded at the
 * route-layout level via next/script strategy="afterInteractive", which
 * runs after hydration — potentially after the button has mounted. The
 * button component uses this to flip its `ready` state once the script's
 * global is defined.
 *
 * Resolves when window.AcceptUI is defined, rejects after `timeoutMs`.
 */
export function waitForAcceptUI(timeoutMs = 8000): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as WindowWithAcceptUI).AcceptUI) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = window.setInterval(() => {
      if ((window as WindowWithAcceptUI).AcceptUI) {
        window.clearInterval(interval);
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        window.clearInterval(interval);
        reject(new Error('AcceptUI.js did not load within timeout'));
      }
    }, 100);
  });
}

type WindowWithAcceptUI = typeof window & {
  AcceptUI?: unknown;
};

type WindowWithHandlers = typeof window & {
  lcgAcceptResponse?: (r: AcceptJsResponse) => void;
  lcgAcceptCanceled?: () => void;
};

/**
 * Installs window-scoped trampolines that forward to the React refs supplied.
 * Returns a disposer that clears the window globals.
 *
 * Accept.js resolves the responseHandler/paymentCanceledHandler by string
 * name against the window object at the moment the user submits the hosted
 * iframe — which may be seconds or minutes after the component mounted.
 * Using refs lets the component re-render without re-binding window globals.
 */
export function bindAcceptHandlers(refs: {
  onResponse: { current: (r: AcceptJsResponse) => void };
  onCancel: { current: () => void };
}): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as WindowWithHandlers;
  w.lcgAcceptResponse = (r) => refs.onResponse.current(r);
  w.lcgAcceptCanceled = () => refs.onCancel.current();
  return () => {
    delete w.lcgAcceptResponse;
    delete w.lcgAcceptCanceled;
  };
}
