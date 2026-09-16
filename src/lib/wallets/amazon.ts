import 'server-only';
import { WebStoreClient } from '@amazonpay/amazon-pay-api-sdk-nodejs';
import { walletConfig } from './config';
import type { AmazonSession, AmazonCharge, WalletAttempt } from './verification';

function client() {
  return new WebStoreClient({ publicKeyId: process.env.AMAZON_PAY_PUBLIC_KEY_ID!,
    privateKey: process.env.AMAZON_PAY_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    region: 'us', sandbox: walletConfig().environment === 'sandbox', algorithm: 'AMZN-PAY-RSASSA-PSS-V2' });
}
function data<T>(response: { data: string | T }): T { return typeof response.data === 'string' ? JSON.parse(response.data) : response.data; }
export function amazonButtonConfig(a: WalletAttempt) {
  const payloadJSON = JSON.stringify({ storeId: process.env.AMAZON_PAY_STORE_ID,
    webCheckoutDetails: { checkoutReviewReturnUrl: `${walletConfig().origin}/api/checkout/wallet/amazon-review/?attempt=${a.id}` },
    merchantMetadata: { merchantReferenceId: a.id, merchantStoreName: 'La Costa Gourmet' } });
  return { payloadJSON, signature: client().generateButtonSignature(payloadJSON),
    publicKeyId: process.env.AMAZON_PAY_PUBLIC_KEY_ID, algorithm: 'AMZN-PAY-RSASSA-PSS-V2' };
}
export async function getAmazonSession(id: string) { return data<AmazonSession>(await client().getCheckoutSession(id)); }
export async function prepareAmazonPayment(a: WalletAttempt): Promise<AmazonSession> {
  return data<AmazonSession>(await client().updateCheckoutSession(a.provider_order_id!, {
    webCheckoutDetails: { checkoutResultReturnUrl: `${walletConfig().origin}/api/checkout/wallet/amazon-return/?attempt=${a.id}` },
    paymentDetails: { paymentIntent: 'AuthorizeWithCapture', canHandlePendingAuthorization: false,
      chargeAmount: { amount: Number(a.total).toFixed(2), currencyCode: 'USD' } },
    merchantMetadata: { merchantReferenceId: a.id, merchantStoreName: 'La Costa Gourmet' },
  }));
}
export async function completeAmazonPayment(a: WalletAttempt) {
  return data<AmazonSession>(await client().completeCheckoutSession(a.provider_order_id!, {
    chargeAmount: { amount: Number(a.total).toFixed(2), currencyCode: 'USD' },
  }, { 'x-amz-pay-idempotency-key': a.id.replace(/-/g, '') }));
}
export async function getAmazonCharge(id: string) { return data<AmazonCharge>(await client().getCharge(id)); }
