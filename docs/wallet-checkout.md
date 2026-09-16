# Wallet checkout

PayPal, Apple Pay (processed by PayPal), and Amazon Pay are implemented alongside the existing Authorize.net card flow. Buyers choose a wallet on the store checkout, before the card-only Authorize.net redirect. Apple Pay is shown only when the device and merchant are eligible.

## Current status

- Implemented in the isolated `feat/wallet-checkout` worktree. Not deployed or enabled on the live Vercel store.
- Only Authorize.net credentials were found in the existing local configuration. PayPal/Amazon accounts are unconfirmed; the owner said they are not sure whether these exist.
- Defaults are disabled. Configuration and tests alone do not activate merchant accounts.
- Automated verification and database tests use synthetic data, without live payments, real customer email, or production database writes.
- The separately hosted static homepage review does not execute these server payment APIs.

## Merchant setup and activation

1. Confirm a PayPal Business account, obtain app credentials and merchant ID in the provider dashboard, and enable Apple Pay for that account. Configure sandbox credentials in a separate HTTPS preview backed by a sandbox database.
2. Complete Amazon Pay merchant registration and obtain its merchant ID, store ID, public-key ID and matching private key. This implementation uses the US region and USD. Register the preview and production domains in Seller Central.
3. Apply `supabase/migrations/20260916211425_wallet_checkout.sql` to the sandbox database. It adds service-role-only checkout attempts and provider identifiers on payment records. Creation and finalization each run in one database transaction.
4. Configure the variables in `.env.example`. Keep `WALLET_CHECKOUT_ENABLED=false` until the migration, merchant configuration, and domain checks are ready. Never enable sandbox wallets against the production database. Keep secrets server-side and separate between environments.
5. For Apple Pay, the domain-association route serves the unmodified official PayPal sandbox/live file selected by `WALLET_ENVIRONMENT`. Register every exact domain in PayPal. Verify `/.well-known/apple-developer-merchantid-domain-association` returns the correct file with HTTP 200 and no redirect on the deployed domain before activation. Next's trailing-slash redirect excludes `.well-known`; the existing redirect configuration is preserved.
6. Set `PAYPAL_APPLE_PAY_ENABLED=true` only after domain registration. Enable wallets on the sandbox preview and run the acceptance matrix below using provider test accounts and an eligible Apple Pay device.
7. Configure an authenticated scheduled GET to `/api/cron/reconcile-wallet-payments/` (trailing slash required), typically every five minutes, with `Authorization: Bearer <CRON_SECRET>`. This is a read/verify recovery path for captured payments whose browser return was lost. It never starts a new charge. Choose a scheduler supported by the hosting plan; no new production schedule has been activated.
8. After the sandbox matrix passes, deploy the reviewed branch, apply the migration to production, configure live credentials/domain registration, and set `WALLET_ENVIRONMENT=live` with `WALLET_CHECKOUT_ENABLED=true`. Then perform owner-approved live acceptance checks. Do not remove Authorize.net during this rollout.

## Sandbox acceptance matrix

- PayPal approval, capture and order receipt; cancellation; funding decline; popup close.
- Apple Pay eligible and ineligible devices; merchant validation; declined token; cancel; successful capture; unregistered domain.
- Amazon selection/review/result redirects; cancel; decline; pending capture; repeated review and return callbacks.
- Change the client subtotal: the provider must use the server's price and shipping calculation.
- Replay create/confirm requests and concurrent callbacks: one provider order/capture and one payment record.
- Lose the response after capture and reload checkout: reuse the stored request ID and check the existing payment. Never suggest another payment while the outcome is uncertain.
- Attempt another order's callback/cookie, wrong currency/amount/merchant and duplicate provider capture: no order is marked paid.
- Disable all wallet flags and confirm Authorize.net card checkout still works.
- Confirm pending capture recovery with the scheduled reconciler and order-status poll.

## Implementation notes

Wallet attempts bind an immutable server-priced order to the browser's HttpOnly owner cookie, a stable request ID and one provider session. PayPal create/capture requests use stable idempotency keys. Amazon session binding occurs before authorization, so a second session generated from a replayed signed button cannot pay the same attempt.

Only authenticated server API responses can finalize an order. A completed PayPal capture must match its provider order, invoice, merchant, USD currency, exact amount and final-capture flag. Amazon requires the linked completed checkout session and its matching captured charge/permission. Authorization or pending capture alone never marks an order paid.

The ledger, order state and audit entry update atomically, with a provider transaction uniqueness constraint. No wallet transaction is stored as an Authorize.net transaction. Sandbox finalization skips customer emails and vendor order drafts. Live notifications use the existing order notification/fulfillment code after the first successful finalization; operational recovery is required if a process exits after the database commit but before notifications.

Wallet refunds must be handled in the relevant merchant dashboard until a provider-specific admin refund flow is implemented. The existing Authorize.net refund tools cannot refund these provider transaction IDs.

This branch preserves the existing server shipping rules (currently a $70 free-shipping threshold); it fixes the checkout estimate to use the same tier function. The approved homepage preview separately says $80. Reconcile that store-wide pricing change before combining the homepage and checkout releases.

## Local checks

```sh
pnpm exec tsx --test src/lib/wallets/verification.test.ts
node --conditions=react-server --import tsx --test src/lib/wallets/providers.test.ts
pnpm exec tsx scripts/test-wallet-database.ts
pnpm exec tsc --noEmit
pnpm exec eslint src/lib/wallets src/components/checkout/WalletPayments.tsx src/components/checkout/CheckoutForm.tsx src/app/api/checkout/wallet src/app/api/cron/reconcile-wallet-payments src/app/.well-known
pnpm build
```

The database test uses PGlite with the real repository schema and new migration. Only Supabase auth bootstrap and the unrelated citext domain are stubbed. It verifies atomic rollback, idempotency, replay rejection and table/function privileges. It does not replace provider sandbox testing.

All checks above passed on September 16, 2026. Provider tests mock PayPal HTTP responses and exercise the actual Amazon SDK signing with a generated test key; no provider sandbox payment has been performed. The full build used public, read-only catalog access and disabled wallets. It reports one existing image-alt lint warning in `ImageWithFallback.tsx`.

HTTP smoke checks against the production build passed: disabled wallet configuration exposes no secrets, create/confirm reject an untrusted origin with 403, reconciliation rejects missing authentication with 401, and the exact Apple domain-association URL returns 200 without a redirect and matches the official sandbox file byte for byte.

## Provider references

- [PayPal Orders integration](https://developer.paypal.com/checkout/put-it-all-together/)
- [PayPal Apple Pay integration and domain setup](https://developer.paypal.com/v5/apple-pay/integrate/)
- [Amazon Pay Checkout](https://developer.amazon.com/docs/amazon-pay-checkout/introduction.html)
- [Amazon Pay official Node SDK](https://github.com/amzn/amazon-pay-api-sdk-nodejs)
