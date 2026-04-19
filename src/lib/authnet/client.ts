'use client';

import { acceptJsUrl, resolveAuthnetEnv } from '@/lib/authnet/environment';

/**
 * Accept.js AcceptUI integration — hosted iframe popup.
 *
 * Card data stays inside Auth.net's iframe and is never touched by our DOM
 * or our server. Client receives an opaque token (dataDescriptor + dataValue)
 * on success.
 *
 * Integration pattern in React:
 *
 *   1. Call loadAcceptJs() once from a client component's useEffect.
 *   2. Assign a window-scoped response trampoline via bindAcceptHandlers()
 *      that forwards to a React ref (stable binding, fresh closure).
 *   3. Render a <button className="AcceptUI" data-...> — Auth.net replaces
 *      its click handler to open the hosted iframe popup.
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

const SCRIPT_ATTR = 'data-lcg-acceptjs';

/**
 * Idempotently injects the Accept.js script. Resolves when the script tag
 * has loaded (or immediately if already on the page).
 */
export function loadAcceptJs(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  const env = resolveAuthnetEnv(process.env.NEXT_PUBLIC_AUTHNET_ENVIRONMENT);
  const src = acceptJsUrl(env);

  const existing = document.querySelector(`script[${SCRIPT_ATTR}]`) as HTMLScriptElement | null;
  if (existing) {
    if (existing.dataset.loaded === 'true') return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Accept.js failed to load')), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.setAttribute(SCRIPT_ATTR, '');
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true },
    );
    script.addEventListener('error', () => reject(new Error('Accept.js failed to load')), { once: true });
    document.head.appendChild(script);
  });
}

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
