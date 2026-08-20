/**
 * Pure selection logic for matching an Auth.net unsettled-transaction list
 * against one of our invoice numbers. Kept free of 'server-only' so the
 * tsx-run unit test can import it (same pattern as safe-json.ts).
 *
 * A customer who retries can leave several transactions carrying the same
 * invoice (e.g. a decline followed by an approval), so recency alone is
 * the wrong tiebreak: prefer the newest transaction in an approved-ish
 * state, and only fall back to the newest of any state (so a lone decline
 * still surfaces and can cancel the order).
 */

export type UnsettledTransactionSummary = {
  transId?: string;
  invoiceNumber?: string;
  transactionStatus?: string;
  submitTimeUTC?: string;
};

/** States meaning "money moved or is moving" per getUnsettledTransactionList. */
const APPROVED_STATUSES = new Set([
  'authorizedPendingCapture',
  'capturedPendingSettlement',
  'settledSuccessfully',
  'FDSPendingReview',
  'FDSAuthorizedPendingReview',
]);

export function pickTransactionForInvoice(
  transactions: UnsettledTransactionSummary[],
  invoiceNumber: string,
): string | null {
  const matches = transactions
    .filter((t) => t.transId && t.invoiceNumber === invoiceNumber)
    // ISO-8601 UTC timestamps sort lexicographically; newest first.
    .sort((a, b) => (b.submitTimeUTC ?? '').localeCompare(a.submitTimeUTC ?? ''));

  if (matches.length === 0) return null;

  const approved = matches.find((t) => APPROVED_STATUSES.has(t.transactionStatus ?? ''));
  return (approved ?? matches[0])!.transId!;
}
