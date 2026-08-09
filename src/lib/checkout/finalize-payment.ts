import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TransactionDetails } from '@/lib/authnet/hosted';
import { safeJson } from '@/lib/authnet/safe-json';
import { autoDraftVendorPosForOrder } from '@/lib/admin/vendor-po';
import { notifyOrderPlaced } from '@/lib/email/notify-order-placed';

/**
 * Single finalisation path for a verified Auth.net transaction — shared by
 * the hosted-payment browser callback and the Auth.net webhook, so an order
 * reaches 'paid' identically no matter which messenger arrives first (or
 * whether the other one ever does).
 *
 * Concurrency: both messengers can fire for the same transaction within
 * seconds. The status transition is a conditional update claiming the order
 * out of 'pending' — whichever caller wins the claim writes the payments
 * row and sends the emails; the loser sees 'already_final' and does
 * nothing. payments.authnet_transaction_id is UNIQUE as a second fence.
 */

export type FinalizableOrder = {
  id: string;
  order_number: string;
  status: string;
  total: number | string;
};

export type FinalizeResult =
  | { outcome: 'already_final' }
  | { outcome: 'refid_mismatch' }
  | { outcome: 'amount_mismatch' }
  | { outcome: 'declined' }
  | {
      outcome: 'finalized';
      orderStatus: 'paid' | 'payment_held';
      paymentRecordFailed: boolean;
    };

export async function finalizeOrderPayment(opts: {
  admin: SupabaseClient;
  order: FinalizableOrder;
  tx: TransactionDetails;
  /** payment_audit_log.source — 'hosted_callback' | 'authnet_webhook' */
  source: string;
  /**
   * Await vendor-PO drafting + emails instead of fire-and-forget. The
   * webhook awaits (no customer waiting, and returning early on a
   * serverless runtime can freeze the work); the browser callback keeps
   * them fire-and-forget so the redirect isn't delayed.
   */
  awaitSideEffects?: boolean;
}): Promise<FinalizeResult> {
  const { admin, order, tx, source } = opts;

  if (order.status === 'paid' || order.status === 'payment_held') {
    return { outcome: 'already_final' };
  }

  const expectedTotal = Number(order.total);
  const amountCents = Math.round(expectedTotal * 100);

  // Spoof checks — the transaction must be the one we created for this order.
  if (tx.refId && tx.refId !== order.order_number) {
    void admin.from('payment_audit_log').insert({
      order_id: order.id,
      event_type: 'callback_refid_mismatch',
      transaction_id: tx.transId,
      amount_cents: amountCents,
      raw_response: safeJson(tx.raw),
      error_detail: `refId=${tx.refId} order_number=${order.order_number}`,
      source,
    });
    return { outcome: 'refid_mismatch' };
  }

  if (tx.amount !== null && Math.abs(tx.amount - expectedTotal) > 0.01) {
    void admin.from('payment_audit_log').insert({
      order_id: order.id,
      event_type: 'callback_amount_mismatch',
      transaction_id: tx.transId,
      amount_cents: amountCents,
      raw_response: safeJson(tx.raw),
      error_detail: `authnet=${tx.amount} expected=${expectedTotal}`,
      source,
    });
    return { outcome: 'amount_mismatch' };
  }

  const approved = tx.responseCode === '1';
  const held = tx.responseCode === '4';
  const declined = tx.responseCode === '2';

  if (!approved && !held) {
    void admin.from('payment_audit_log').insert({
      order_id: order.id,
      event_type: declined ? 'auth_net_declined' : 'auth_net_error',
      transaction_id: tx.transId,
      amount_cents: amountCents,
      raw_response: safeJson(tx.raw),
      error_detail: tx.responseReason ?? `responseCode=${tx.responseCode}`,
      source,
    });
    // Cancel only from pending — never claw back an order another
    // (successful) transaction already finalised.
    await admin
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', order.id)
      .eq('status', 'pending');
    return { outcome: 'declined' };
  }

  // Approved or held — claim the order out of 'pending' first. Money has
  // moved at Auth.net, so from here every failure mode still leaves the
  // order advanced rather than stranded.
  const nextOrderStatus = approved ? 'paid' : 'payment_held';
  const { data: claimed, error: claimErr } = await admin
    .from('orders')
    .update({ status: nextOrderStatus })
    .eq('id', order.id)
    .eq('status', 'pending')
    .select('id');

  if (claimErr) {
    void admin.from('payment_audit_log').insert({
      order_id: order.id,
      event_type: 'status_update_failed',
      transaction_id: tx.transId,
      amount_cents: amountCents,
      raw_response: safeJson(tx.raw),
      error_detail: `intended='${nextOrderStatus}'; ${claimErr.message}`,
      source,
    });
    // Fall through and still try to record the payment — the forensic row
    // matters more when the status write is broken, and the UNIQUE
    // transaction id keeps a later retry from double-recording.
  } else if (!claimed || claimed.length === 0) {
    // Lost the race — the other messenger finalised moments ago.
    return { outcome: 'already_final' };
  }

  const paymentStatus = approved ? 'succeeded' : 'held_for_review';
  const masked = tx.accountNumber ?? '';
  const cardLastFour = masked ? masked.replace(/\D/g, '').slice(-4) || null : null;

  const { error: payInsErr } = await admin.from('payments').insert({
    order_id: order.id,
    type: 'auth_capture',
    amount: expectedTotal,
    status: paymentStatus,
    authnet_transaction_id: tx.transId,
    authnet_response_code: tx.responseCode,
    authnet_response_reason: tx.responseReason,
    authnet_avs_result: tx.avsResultCode,
    authnet_cvv_result: tx.cvvResultCode,
    fraud_held: held,
    fraud_reason: held ? tx.responseReason : null,
    card_last_four: cardLastFour,
    card_brand: tx.accountType,
    raw_response: safeJson(tx.raw),
  });

  // 23505 = unique violation on authnet_transaction_id: the row already
  // exists from the other messenger. Not a failure.
  const paymentRecordFailed = Boolean(payInsErr) && payInsErr!.code !== '23505';

  if (paymentRecordFailed) {
    void admin.from('payment_audit_log').insert({
      order_id: order.id,
      event_type: 'payment_insert_failed',
      transaction_id: tx.transId,
      amount_cents: amountCents,
      raw_response: safeJson(tx.raw),
      error_detail: payInsErr!.message,
      source,
    });
  } else if (!payInsErr) {
    void admin.from('payment_audit_log').insert({
      order_id: order.id,
      event_type: 'payment_inserted',
      transaction_id: tx.transId,
      amount_cents: amountCents,
      raw_response: safeJson(tx.raw),
      source,
    });
  }

  // Vendor PO draft + customer/admin emails. Both swallow their own errors.
  const sideEffects = Promise.all([
    autoDraftVendorPosForOrder(order.id),
    notifyOrderPlaced(order.id),
  ]);
  if (opts.awaitSideEffects) {
    await sideEffects;
  } else {
    void sideEffects;
  }

  return { outcome: 'finalized', orderStatus: nextOrderStatus, paymentRecordFailed };
}
