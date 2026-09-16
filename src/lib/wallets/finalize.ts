import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { walletConfig } from './config';
import { notifyOrderPlaced } from '@/lib/email/notify-order-placed';
import { autoDraftVendorPosForOrder } from '@/lib/admin/vendor-po';
import { getPayPalOrder, capturePayPalOrder } from './paypal';
import { getAmazonSession, getAmazonCharge, completeAmazonPayment } from './amazon';
import { verifyPayPalOrder, verifyPayPalCapture, verifyAmazonSession, verifyAmazonCharge, type WalletAttempt } from './verification';

export async function reconcileWalletPayment(a: WalletAttempt, buyerReturned = false): Promise<'paid' | 'pending'> {
  if (a.environment !== walletConfig().environment) throw new Error('Checkout environment mismatch');
  if (a.status === 'paid') return 'paid';
  if (!a.provider_order_id) return 'pending';
  let payment;
  if (a.method === 'amazon_pay') {
    let session = await getAmazonSession(a.provider_order_id);
    verifyAmazonSession(session, a);
    if (buyerReturned && session.statusDetails?.state === 'Open') {
      await completeAmazonPayment(a);
      session = await getAmazonSession(a.provider_order_id);
    }
    if (!session.chargeId) return 'pending';
    payment = verifyAmazonCharge(session, await getAmazonCharge(session.chargeId), a);
  } else {
    let order = await getPayPalOrder(a.provider_order_id);
    verifyPayPalOrder(order, a, process.env.PAYPAL_MERCHANT_ID!);
    if (buyerReturned && order.status === 'APPROVED') {
      try { await capturePayPalOrder(a); } catch {
        // A timed-out capture can still have succeeded. Re-fetch instead of creating another order.
      }
      order = await getPayPalOrder(a.provider_order_id);
    }
    payment = verifyPayPalCapture(order, a, process.env.PAYPAL_MERCHANT_ID!);
  }
  if (!payment) return 'pending';
  const { data, error } = await createAdminClient().rpc('finalize_wallet_checkout', {
    p_attempt_id: a.id, p_transaction_id: payment.transactionId, p_amount: payment.amount, p_currency: payment.currency,
  });
  if (error) throw new Error('Payment received; order confirmation is pending');
  // Sandbox must never send real customer emails or draft fulfillment orders.
  if (data === 'finalized' && a.environment === 'live') {
    await Promise.all([autoDraftVendorPosForOrder(a.order_id), notifyOrderPlaced(a.order_id)]);
  }
  return 'paid';
}
