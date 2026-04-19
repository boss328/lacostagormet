import 'server-only';
import { APIContracts, APIControllers, Constants as SDKConstants } from 'authorizenet';
import { resolveAuthnetEnv } from '@/lib/authnet/environment';

/**
 * Server-side Auth.net charge. Pass the opaque token produced by Accept.js
 * (dataDescriptor + dataValue) plus the amount and metadata. Returns a
 * normalised result the checkout API writes into the `payments` row.
 *
 * This module is server-only. AUTHNET_TRANSACTION_KEY must never reach a
 * client bundle.
 */

export type ChargeInput = {
  opaqueData: { dataDescriptor: string; dataValue: string };
  amount: number;
  orderNumber: string;
  customerEmail: string;
  billingAddress: Address;
  shippingAddress: Address;
};

export type Address = {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  phone?: string;
  company?: string;
};

export type ChargeOutcome =
  | 'approved'
  | 'declined'
  | 'held_for_review'
  | 'error'
  | 'network_error';

export type ChargeResult = {
  outcome: ChargeOutcome;
  transactionId: string | null;
  authCode: string | null;
  responseCode: string | null;
  responseReason: string | null;
  avsResult: string | null;
  cvvResult: string | null;
  cardLastFour: string | null;
  cardBrand: string | null;
  fraudReason: string | null;
  rawResponse: unknown;
  customerMessage: string;
};

const GENERIC_DECLINE =
  'Your payment could not be processed. Please try a different card or contact your bank.';
const GENERIC_ERROR =
  'Something went wrong processing your payment. Your card was not charged. Please try again.';
const HELD_MESSAGE =
  'Your order has been received. We are doing a quick review of your payment — you will hear from us within one business day.';

function toAuthnetAddress(a: Address): InstanceType<typeof APIContracts.CustomerAddressType> {
  const addr = new APIContracts.CustomerAddressType();
  addr.setFirstName(a.firstName);
  addr.setLastName(a.lastName);
  if (a.company) addr.setCompany(a.company);
  addr.setAddress([a.address1, a.address2].filter(Boolean).join(', '));
  addr.setCity(a.city);
  addr.setState(a.state);
  addr.setZip(a.zip);
  addr.setCountry(a.country ?? 'USA');
  if (a.phone) addr.setPhoneNumber(a.phone);
  return addr;
}

function extractString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'function') {
    try {
      const r = (v as () => unknown)();
      return typeof r === 'string' ? r : null;
    } catch {
      return null;
    }
  }
  return null;
}

function looksLikeFraudHold(reasonText: string): boolean {
  const t = reasonText.toLowerCase();
  return (
    t.includes('fraud') ||
    t.includes('held for review') ||
    t.includes('suspicious') ||
    t.includes('fds')
  );
}

export async function chargeCard(input: ChargeInput): Promise<ChargeResult> {
  const env = resolveAuthnetEnv(process.env.AUTHNET_ENVIRONMENT);
  const endpoint =
    env === 'production' ? SDKConstants.endpoint.production : SDKConstants.endpoint.sandbox;

  const apiLoginId = process.env.AUTHNET_API_LOGIN_ID;
  const transactionKey = process.env.AUTHNET_TRANSACTION_KEY;
  if (!apiLoginId || !transactionKey) {
    return emptyResult('error', GENERIC_ERROR, 'Auth.net credentials are not configured.');
  }

  const merchantAuth = new APIContracts.MerchantAuthenticationType();
  merchantAuth.setName(apiLoginId);
  merchantAuth.setTransactionKey(transactionKey);

  const opaque = new APIContracts.OpaqueDataType();
  opaque.setDataDescriptor(input.opaqueData.dataDescriptor);
  opaque.setDataValue(input.opaqueData.dataValue);

  const payment = new APIContracts.PaymentType();
  payment.setOpaqueData(opaque);

  const customer = new APIContracts.CustomerDataType();
  customer.setEmail(input.customerEmail);

  const txnRequest = new APIContracts.TransactionRequestType();
  txnRequest.setTransactionType(APIContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
  txnRequest.setAmount(Number(input.amount.toFixed(2)));
  txnRequest.setPayment(payment);
  txnRequest.setCustomer(customer);
  txnRequest.setBillTo(toAuthnetAddress(input.billingAddress));
  txnRequest.setShipTo(toAuthnetAddress(input.shippingAddress));

  const createRequest = new APIContracts.CreateTransactionRequest();
  createRequest.setMerchantAuthentication(merchantAuth);
  createRequest.setTransactionRequest(txnRequest);
  // setRefId lives on the wrapping CreateTransactionRequest, not on the
  // inner TransactionRequestType. The SDK throws TypeError if called on
  // the inner class.
  createRequest.setRefId(input.orderNumber);

  const ctrl = new APIControllers.CreateTransactionController(createRequest.getJSON());
  ctrl.setEnvironment(endpoint);

  const apiResponse = await new Promise<unknown>((resolve, reject) => {
    try {
      ctrl.execute(() => {
        try {
          resolve(ctrl.getResponse());
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      reject(e);
    }
  }).catch((e): null => {
    console.error('[authnet] network error', e);
    return null;
  });

  if (!apiResponse) {
    return emptyResult('network_error', GENERIC_ERROR, 'Auth.net network error — no response.');
  }

  const response = new APIContracts.CreateTransactionResponse(apiResponse);
  const apiResultCode = extractString(response.getMessages?.()?.getResultCode) ?? 'Error';
  const txResponse = response.getTransactionResponse?.();

  if (!txResponse) {
    const firstMsg = response.getMessages?.()?.getMessage?.()?.[0];
    const reason = extractString(firstMsg?.getText) ?? 'Unknown Auth.net error';
    return emptyResult('error', GENERIC_ERROR, reason, apiResponse);
  }

  const responseCode = extractString(txResponse.getResponseCode) ?? '';
  const transId = extractString(txResponse.getTransId) ?? null;
  const authCode = extractString(txResponse.getAuthCode) ?? null;
  const avs = extractString(txResponse.getAvsResultCode) ?? null;
  const cvv = extractString(txResponse.getCvvResultCode) ?? null;
  const accountNumber = extractString(txResponse.getAccountNumber) ?? '';
  const accountType = extractString(txResponse.getAccountType) ?? null;
  const cardLastFour = accountNumber ? accountNumber.slice(-4) : null;

  const txMsg = txResponse.getMessages?.()?.getMessage?.()?.[0];
  const errArr = txResponse.getErrors?.()?.getError?.();
  const reasonText =
    extractString(txMsg?.getDescription) ??
    extractString(errArr?.[0]?.getErrorText) ??
    '';

  // Response code mapping per 04.1-checkout-and-payment.md:
  //   1 + fraud text → held. 1 → approved. 2 → declined. 3 → error. 4 → held.
  if (responseCode === '1') {
    if (apiResultCode === 'Ok' && !looksLikeFraudHold(reasonText)) {
      return {
        outcome: 'approved',
        transactionId: transId,
        authCode,
        responseCode,
        responseReason: reasonText || 'Approved',
        avsResult: avs,
        cvvResult: cvv,
        cardLastFour,
        cardBrand: accountType,
        fraudReason: null,
        rawResponse: apiResponse,
        customerMessage: 'Approved',
      };
    }
    return {
      outcome: 'held_for_review',
      transactionId: transId,
      authCode,
      responseCode,
      responseReason: reasonText,
      avsResult: avs,
      cvvResult: cvv,
      cardLastFour,
      cardBrand: accountType,
      fraudReason: reasonText,
      rawResponse: apiResponse,
      customerMessage: HELD_MESSAGE,
    };
  }

  if (responseCode === '4') {
    return {
      outcome: 'held_for_review',
      transactionId: transId,
      authCode,
      responseCode,
      responseReason: reasonText,
      avsResult: avs,
      cvvResult: cvv,
      cardLastFour,
      cardBrand: accountType,
      fraudReason: reasonText,
      rawResponse: apiResponse,
      customerMessage: HELD_MESSAGE,
    };
  }

  if (responseCode === '2') {
    return {
      outcome: 'declined',
      transactionId: transId,
      authCode,
      responseCode,
      responseReason: reasonText,
      avsResult: avs,
      cvvResult: cvv,
      cardLastFour,
      cardBrand: accountType,
      fraudReason: null,
      rawResponse: apiResponse,
      customerMessage: GENERIC_DECLINE,
    };
  }

  return {
    outcome: 'error',
    transactionId: transId,
    authCode: null,
    responseCode: responseCode || null,
    responseReason: reasonText || 'Auth.net error',
    avsResult: avs,
    cvvResult: cvv,
    cardLastFour,
    cardBrand: accountType,
    fraudReason: null,
    rawResponse: apiResponse,
    customerMessage: GENERIC_ERROR,
  };
}

function emptyResult(
  outcome: ChargeOutcome,
  customerMessage: string,
  reason: string,
  raw?: unknown,
): ChargeResult {
  return {
    outcome,
    transactionId: null,
    authCode: null,
    responseCode: null,
    responseReason: reason,
    avsResult: null,
    cvvResult: null,
    cardLastFour: null,
    cardBrand: null,
    fraudReason: null,
    rawResponse: raw ?? null,
    customerMessage,
  };
}
