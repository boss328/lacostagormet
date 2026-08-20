import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchTransactionDetails, findUnsettledTransactionByInvoice } from '@/lib/authnet/hosted';
import {
  finalizeOrderPayment,
  type FinalizableOrder,
  type FinalizeResult,
} from '@/lib/checkout/finalize-payment';

/**
 * Server-side payment verification for a pending order, driven by nothing
 * but our own order number. Exists because the Accept Hosted redirect
 * return carries no transaction data (see lib/authnet/hosted.ts header):
 * when the customer lands back on our site we must ask Auth.net ourselves
 * whether they paid.
 *
 * Flow: scan Auth.net's unsettled-transaction list for our invoice number
 * → re-fetch the authoritative transaction details → hand off to the same
 * idempotent finalizeOrderPayment the webhook uses. Safe to call
 * repeatedly and concurrently with the webhook: finalization claims the
 * order out of 'pending' conditionally, so exactly one caller wins.
 *
 * Callers: the hosted-callback return redirect (once, as the customer
 * lands) and the payment-status poll endpoint (every few seconds while
 * the confirmation page waits).
 */

export type VerifyPendingResult =
  | FinalizeResult
  | { outcome: 'no_transaction' }
  | { outcome: 'lookup_failed' };

export async function verifyPendingOrderPayment(opts: {
  admin: SupabaseClient;
  order: FinalizableOrder;
  /** payment_audit_log.source for every row this attempt writes. */
  source: string;
  /**
   * Write a 'verify_no_transaction' audit row when Auth.net has no
   * transaction for this invoice. The one-shot callback wants that trail;
   * the poll endpoint passes false so 20 quiet polls of an abandoned
   * order don't write 20 rows.
   */
  auditNoTransaction?: boolean;
}): Promise<VerifyPendingResult> {
  const { admin, order, source } = opts;

  const found = await findUnsettledTransactionByInvoice(order.order_number);
  if (!found.ok) {
    await admin.from('payment_audit_log').insert({
      order_id: order.id,
      event_type: 'verify_lookup_failed',
      error_detail: found.errorMessage,
      source,
    });
    return { outcome: 'lookup_failed' };
  }

  if (!found.transId) {
    if (opts.auditNoTransaction) {
      await admin.from('payment_audit_log').insert({
        order_id: order.id,
        event_type: 'verify_no_transaction',
        error_detail: `no unsettled Auth.net transaction carries invoice ${order.order_number}`,
        source,
      });
    }
    return { outcome: 'no_transaction' };
  }

  const detail = await fetchTransactionDetails(found.transId);
  if (!detail.ok) {
    await admin.from('payment_audit_log').insert({
      order_id: order.id,
      event_type: 'verify_lookup_failed',
      transaction_id: found.transId,
      error_detail: detail.errorMessage,
      source,
    });
    return { outcome: 'lookup_failed' };
  }

  return finalizeOrderPayment({ admin, order, tx: detail.details, source });
}
