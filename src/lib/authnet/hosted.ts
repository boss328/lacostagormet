import 'server-only';
import { apiEndpoint, hostedPaymentUrl, resolveAuthnetEnv } from '@/lib/authnet/environment';
import type { Address } from '@/lib/authnet/server';

/**
 * Auth.net Accept Hosted — the customer enters card details on Auth.net's
 * domain, not ours. We POST a merchant-authed request that includes the
 * transaction spec; Auth.net returns a short-lived form token. Our browser
 * then POSTs the token to the hosted-payment URL, where Auth.net renders
 * the card-entry page and, on success, POSTs the transaction result back
 * to a callback URL we specify.
 *
 * We bypass the `authorizenet` SDK here and POST raw JSON — the SDK's
 * wrapper methods silently drop fields on the async-callback path (see
 * server.ts for the same pattern we worked around there), and
 * getHostedPaymentPageRequest isn't strongly typed anyway.
 */

export type HostedTokenInput = {
  orderNumber: string;
  amount: number;
  customerEmail: string;
  billingAddress: Address;
  shippingAddress: Address;
  returnUrl: string;  // our /api/checkout/hosted-callback
  cancelUrl: string;  // back to /checkout
};

export type HostedTokenOk = {
  ok: true;
  formToken: string;
  hostedUrl: string;
};

export type HostedTokenErr = {
  ok: false;
  errorMessage: string;
};

export type HostedTokenResult = HostedTokenOk | HostedTokenErr;

type AuthnetMessages = {
  resultCode?: string;
  message?: Array<{ code?: string; text?: string }>;
};

type HostedTokenResponse = {
  token?: string;
  refId?: string;
  messages?: AuthnetMessages;
};

/**
 * Auth.net returns JSON with a UTF-8 BOM prefix. Strip it before parsing.
 */
function parseAuthnetJson(raw: string): unknown {
  const cleaned = raw.replace(/^\uFEFF/, '');
  return JSON.parse(cleaned);
}

function formatAddressBase(a: Address) {
  return {
    firstName: a.firstName.slice(0, 50),
    lastName: a.lastName.slice(0, 50),
    ...(a.company ? { company: a.company.slice(0, 50) } : {}),
    address: [a.address1, a.address2].filter(Boolean).join(', ').slice(0, 60),
    city: a.city.slice(0, 40),
    state: a.state.slice(0, 40),
    zip: a.zip.slice(0, 20),
    country: a.country ?? 'USA',
  };
}

/** Auth.net billTo XSD allows phoneNumber + faxNumber. shipTo does not. */
function formatBillTo(a: Address) {
  return {
    ...formatAddressBase(a),
    ...(a.phone ? { phoneNumber: a.phone.slice(0, 25) } : {}),
  };
}

function formatShipTo(a: Address) {
  return formatAddressBase(a);
}

export async function getHostedPaymentToken(
  input: HostedTokenInput,
): Promise<HostedTokenResult> {
  const env = resolveAuthnetEnv(process.env.AUTHNET_ENVIRONMENT);
  const endpoint = apiEndpoint(env);
  const apiLoginId = process.env.AUTHNET_API_LOGIN_ID;
  const transactionKey = process.env.AUTHNET_TRANSACTION_KEY;
  if (!apiLoginId || !transactionKey) {
    return { ok: false, errorMessage: 'Auth.net credentials not configured' };
  }

  // Auth.net sandbox rejects URLs containing the literal substring
  // "localhost" even though they otherwise begin with http://. Substitute
  // to 127.0.0.1 for API-facing URLs only — the browser resolves both to
  // the same loopback so the customer redirect still works end-to-end.
  const deLocalhost = (u: string) =>
    u.replace('://localhost:', '://127.0.0.1:').replace('://localhost/', '://127.0.0.1/');

  // Auth.net's settingValue fields are JSON-encoded strings (their quirk).
  const hostedPaymentSettings = [
    {
      settingName: 'hostedPaymentReturnOptions',
      settingValue: JSON.stringify({
        showReceipt: false,
        url: deLocalhost(input.returnUrl),
        urlText: 'Continue',
        cancelUrl: deLocalhost(input.cancelUrl),
        cancelUrlText: 'Cancel',
      }),
    },
    {
      settingName: 'hostedPaymentButtonOptions',
      settingValue: JSON.stringify({ text: 'Pay' }),
    },
    {
      settingName: 'hostedPaymentOrderOptions',
      settingValue: JSON.stringify({
        show: true,
        merchantName: 'La Costa Gourmet',
      }),
    },
    {
      settingName: 'hostedPaymentPaymentOptions',
      settingValue: JSON.stringify({
        cardCodeRequired: true,
        showCreditCard: true,
        showBankAccount: false,
      }),
    },
    {
      settingName: 'hostedPaymentShippingAddressOptions',
      settingValue: JSON.stringify({ show: false, required: false }),
    },
    {
      settingName: 'hostedPaymentBillingAddressOptions',
      settingValue: JSON.stringify({ show: true, required: true }),
    },
    {
      settingName: 'hostedPaymentSecurityOptions',
      settingValue: JSON.stringify({ captcha: false }),
    },
    {
      settingName: 'hostedPaymentStyleOptions',
      settingValue: JSON.stringify({ bgColor: '#7A3B1B' }),
    },
    {
      settingName: 'hostedPaymentCustomerOptions',
      settingValue: JSON.stringify({
        showEmail: false,
        requiredEmail: false,
        addPaymentProfile: false,
      }),
    },
  ];

  const body = {
    getHostedPaymentPageRequest: {
      merchantAuthentication: { name: apiLoginId, transactionKey },
      refId: input.orderNumber,
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: input.amount.toFixed(2),
        order: {
          invoiceNumber: input.orderNumber,
          description: `La Costa Gourmet ${input.orderNumber}`,
        },
        customer: { email: input.customerEmail },
        billTo: formatBillTo(input.billingAddress),
        shipTo: formatShipTo(input.shippingAddress),
      },
      hostedPaymentSettings: { setting: hostedPaymentSettings },
    },
  };

  let response: HostedTokenResponse;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    response = parseAuthnetJson(raw) as HostedTokenResponse;
  } catch (e) {
    console.error('[authnet-hosted] network error', e);
    return { ok: false, errorMessage: 'Payment provider is unreachable.' };
  }

  if (response.messages?.resultCode !== 'Ok' || !response.token) {
    const msg = response.messages?.message?.[0]?.text ?? 'Could not create payment page.';
    console.error('[authnet-hosted] token request failed', response);
    return { ok: false, errorMessage: msg };
  }

  return { ok: true, formToken: response.token, hostedUrl: hostedPaymentUrl(env) };
}

/**
 * Used by the callback route to re-fetch the transaction directly from
 * Auth.net — prevents spoofed POSTs since an attacker can't fabricate a
 * real transId tied to our refId and amount.
 */

export type TransactionDetails = {
  transId: string;
  refId: string | null;
  responseCode: string;
  authCode: string | null;
  amount: number | null;
  accountNumber: string | null;
  accountType: string | null;
  avsResultCode: string | null;
  cvvResultCode: string | null;
  responseReason: string | null;
  raw: unknown;
};

export type FetchTxResult =
  | { ok: true; details: TransactionDetails }
  | { ok: false; errorMessage: string; raw?: unknown };

export async function fetchTransactionDetails(transId: string): Promise<FetchTxResult> {
  const env = resolveAuthnetEnv(process.env.AUTHNET_ENVIRONMENT);
  const endpoint = apiEndpoint(env);
  const apiLoginId = process.env.AUTHNET_API_LOGIN_ID;
  const transactionKey = process.env.AUTHNET_TRANSACTION_KEY;
  if (!apiLoginId || !transactionKey) {
    return { ok: false, errorMessage: 'Auth.net credentials not configured' };
  }

  const body = {
    getTransactionDetailsRequest: {
      merchantAuthentication: { name: apiLoginId, transactionKey },
      transId,
    },
  };

  let response: Record<string, unknown>;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    response = parseAuthnetJson(raw) as Record<string, unknown>;
  } catch (e) {
    console.error('[authnet-hosted] transaction-details fetch failed', e);
    return { ok: false, errorMessage: 'Could not verify transaction.' };
  }

  const messages = response.messages as AuthnetMessages | undefined;
  if (messages?.resultCode !== 'Ok') {
    return {
      ok: false,
      errorMessage: messages?.message?.[0]?.text ?? 'Transaction lookup failed',
      raw: response,
    };
  }

  const tx = response.transaction as
    | {
        transId?: string;
        refTransId?: string;
        refId?: string;
        order?: { invoiceNumber?: string };
        responseCode?: number | string;
        authCode?: string;
        authAmount?: number | string;
        settleAmount?: number | string;
        payment?: { creditCard?: { cardNumber?: string; cardType?: string } };
        AVSResponse?: string;
        cardCodeResponse?: string;
        messages?: Array<{ description?: string }>;
      }
    | undefined;

  if (!tx || !tx.transId) {
    return { ok: false, errorMessage: 'Transaction not found', raw: response };
  }

  const amountRaw = tx.authAmount ?? tx.settleAmount ?? null;
  const amount = amountRaw !== null ? Number(amountRaw) : null;

  return {
    ok: true,
    details: {
      transId: tx.transId,
      refId: tx.order?.invoiceNumber ?? tx.refId ?? null,
      responseCode: String(tx.responseCode ?? ''),
      authCode: tx.authCode ?? null,
      amount,
      accountNumber: tx.payment?.creditCard?.cardNumber ?? null,
      accountType: tx.payment?.creditCard?.cardType ?? null,
      avsResultCode: tx.AVSResponse ?? null,
      cvvResultCode: tx.cardCodeResponse ?? null,
      responseReason: tx.messages?.[0]?.description ?? null,
      raw: response,
    },
  };
}
