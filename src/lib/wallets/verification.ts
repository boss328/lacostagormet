import type { WalletMethod } from './config';

export type WalletAttempt = {
  id: string; order_id: string; order_number: string; method: WalletMethod;
  environment: 'sandbox' | 'live'; total: number | string; provider_order_id: string | null;
  status: 'pending' | 'paid'; created_at: string;
};
export type VerifiedPayment = { transactionId: string; amount: string; currency: 'USD' };
type Money = { value?: string; currency_code?: string };
export type PayPalOrder = {
  id?: string; status?: string;
  purchase_units?: Array<{
    reference_id?: string; custom_id?: string; invoice_id?: string;
    amount?: Money; payee?: { merchant_id?: string };
    payments?: { captures?: Array<{ id?: string; status?: string; amount?: Money; final_capture?: boolean }> };
  }>;
};

export function moneyMatches(value: unknown, total: number | string): boolean {
  return typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value) &&
    Number.isSafeInteger(Math.round(Number(value) * 100)) &&
    Number.isFinite(Number(total)) && Number(total) > 0 && Math.round(Number(value) * 100) === Math.round(Number(total) * 100);
}

export function verifyPayPalOrder(order: PayPalOrder, attempt: WalletAttempt, merchantId: string): void {
  const units = order.purchase_units;
  const unit = units?.[0];
  if (!attempt.provider_order_id || order.id !== attempt.provider_order_id || units?.length !== 1 ||
      unit?.custom_id !== attempt.id || unit.invoice_id !== attempt.order_number ||
      unit.payee?.merchant_id !== merchantId || !moneyMatches(unit.amount?.value, attempt.total) ||
      unit.amount?.currency_code !== 'USD') throw new Error('PayPal order verification failed');
}

export function verifyPayPalCapture(order: PayPalOrder, attempt: WalletAttempt, merchantId: string): VerifiedPayment | null {
  verifyPayPalOrder(order, attempt, merchantId);
  const captures = order.purchase_units![0].payments?.captures;
  if (order.status !== 'COMPLETED') return null;
  const capture = captures?.[0];
  if (captures?.length !== 1 || capture?.status !== 'COMPLETED') return null;
  if (!capture.id || capture.final_capture !== true || !moneyMatches(capture.amount?.value, attempt.total) ||
      capture.amount?.currency_code !== 'USD') throw new Error('PayPal capture verification failed');
  return { transactionId: capture.id, amount: capture.amount.value!, currency: 'USD' };
}

export type AmazonSession = {
  checkoutSessionId?: string; chargeId?: string; chargePermissionId?: string;
  merchantMetadata?: { merchantReferenceId?: string };
  statusDetails?: { state?: string };
  paymentDetails?: { chargeAmount?: { amount?: string; currencyCode?: string } };
  webCheckoutDetails?: { amazonPayRedirectUrl?: string };
};
export type AmazonCharge = {
  chargeId?: string; chargePermissionId?: string; statusDetails?: { state?: string };
  captureAmount?: { amount?: string; currencyCode?: string };
};
export function verifyAmazonSession(session: AmazonSession, attempt: WalletAttempt): void {
  if (!attempt.provider_order_id || session.checkoutSessionId !== attempt.provider_order_id ||
      session.merchantMetadata?.merchantReferenceId !== attempt.id ||
      !moneyMatches(session.paymentDetails?.chargeAmount?.amount, attempt.total) ||
      session.paymentDetails?.chargeAmount?.currencyCode !== 'USD') throw new Error('Amazon session verification failed');
}
export function verifyAmazonCharge(session: AmazonSession, charge: AmazonCharge, attempt: WalletAttempt): VerifiedPayment | null {
  verifyAmazonSession(session, attempt);
  if (session.statusDetails?.state !== 'Completed' || charge.statusDetails?.state !== 'Captured') return null;
  if (!charge.chargeId || charge.chargeId !== session.chargeId || !session.chargePermissionId ||
      charge.chargePermissionId !== session.chargePermissionId ||
      !moneyMatches(charge.captureAmount?.amount, attempt.total) || charge.captureAmount?.currencyCode !== 'USD') {
    throw new Error('Amazon charge verification failed');
  }
  return { transactionId: charge.chargeId, amount: charge.captureAmount.amount!, currency: 'USD' };
}
