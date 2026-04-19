'use client';

import { useEffect, useRef, useState } from 'react';
import {
  loadAcceptJs,
  bindAcceptHandlers,
  isAcceptJsSuccess,
  type AcceptJsResponse,
} from '@/lib/authnet/client';

type AcceptUIButtonProps = {
  onToken: (token: {
    dataDescriptor: string;
    dataValue: string;
    cardLastFour: string | null;
  }) => void;
  onCancel?: () => void;
  disabled?: boolean;
  label: string;
};

/**
 * Renders the Auth.net AcceptUI button. The className MUST contain the
 * literal "AcceptUI" token — Accept.js uses a delegated click listener to
 * open the hosted iframe. Other classes can be chained for styling.
 */
export function AcceptUIButton({
  onToken,
  onCancel,
  disabled = false,
  label,
}: AcceptUIButtonProps) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const onTokenRef = useRef(onToken);
  const onCancelRef = useRef(onCancel ?? (() => {}));
  onTokenRef.current = onToken;
  onCancelRef.current = onCancel ?? (() => {});

  // Bind the window trampolines once. They forward to the refs above, so
  // re-renders refresh the closures without remounting the button.
  useEffect(() => {
    const onResponseRef = {
      current: (r: AcceptJsResponse) => {
        if (!isAcceptJsSuccess(r)) {
          const text = r.messages.message[0]?.text ?? 'Card information is invalid.';
          setLoadError(text);
          return;
        }
        setLoadError(null);
        const masked = r.encryptedData?.cardNumber ?? '';
        const cardLastFour = /(\d{4})\s*$/.exec(masked)?.[1] ?? null;
        onTokenRef.current({
          dataDescriptor: r.opaqueData.dataDescriptor,
          dataValue: r.opaqueData.dataValue,
          cardLastFour,
        });
      },
    };
    const onCancelInner = {
      current: () => onCancelRef.current(),
    };
    const dispose = bindAcceptHandlers({
      onResponse: onResponseRef,
      onCancel: onCancelInner,
    });

    loadAcceptJs()
      .then(() => setReady(true))
      .catch((e) => {
        console.error('[AcceptUIButton]', e);
        setLoadError('Could not reach the payment provider. Please refresh and try again.');
      });

    return () => {
      dispose();
    };
  }, []);

  const apiLoginID = process.env.NEXT_PUBLIC_AUTHNET_API_LOGIN_ID ?? '';
  const clientKey = process.env.NEXT_PUBLIC_AUTHNET_CLIENT_KEY ?? '';

  const missingKeys = !apiLoginID || !clientKey;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className={`AcceptUI btn btn-solid w-full justify-center ${
          !ready || disabled || missingKeys ? 'opacity-60 cursor-not-allowed' : ''
        }`}
        style={{ padding: '16px 26px' }}
        data-billingAddressOptions='{"show":false,"required":false}'
        data-apiLoginID={apiLoginID}
        data-clientKey={clientKey}
        data-acceptUIFormBtnTxt="Pay"
        data-acceptUIFormHeaderTxt="Card information"
        data-paymentOptions='{"showCreditCard":true,"showBankAccount":false}'
        data-responseHandler="lcgAcceptResponse"
        data-paymentCanceledHandler="lcgAcceptCanceled"
        disabled={!ready || disabled || missingKeys}
        aria-describedby={loadError ? 'acceptui-error' : undefined}
      >
        <span>{ready ? label : 'Loading secure form…'}</span>
        <span className="btn-arrow" aria-hidden="true">→</span>
      </button>

      {loadError && (
        <p id="acceptui-error" className="type-data-mono text-accent" role="alert">
          {loadError}
        </p>
      )}
      {missingKeys && (
        <p className="type-data-mono text-accent">
          Payment provider credentials are missing — check NEXT_PUBLIC_AUTHNET_*.
        </p>
      )}
    </div>
  );
}
