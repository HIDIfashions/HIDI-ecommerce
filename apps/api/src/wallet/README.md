# HIDI store-credit wallet

This is a durable wallet, separate from the older illustrative reward-preview
endpoint. Enable new enrolment, earning and spending with `HIDI_WALLET_ENABLED=true`
only after the migration and staged payment/refund checks pass.

## Approved launch rule and implementation policy

- Rewards: 2 points (₹2) for each complete ₹100 of qualifying merchandise.
- Release: seven elapsed days after recorded delivery; never order creation.
- No percentage redemption cap. A wallet can pay the entire gross order; that
  checkout must not open Razorpay or create a positive external payment.
- Qualifying spend is merchandise subtotal minus discounts and wallet applied,
  floored at zero. Shipping and separately stored tax earn no points. Tax already
  included in merchandise prices is not split out. Wallet-funded spend does not
  generate additional rewards. No reward expiry is implemented.
- Only newly authenticated orders receive a policy snapshot; historical guest
  orders are not retrospectively converted into wallet credits.

The final two calculation choices are implementation policy and should be
published in programme terms before launch. Other promotional offers must not
be silently introduced by this module.

## Accounting and transaction boundaries

`WalletAccount.balancePaise` is the signed posted ledger balance.
`reservedPaise` is active checkout holds, not a debit. Spendable credit is
`max(0, balancePaise - reservedPaise)`; negative balance is debt from a late
reward reversal, not a demand for a separate customer cash payment. Future
credits offset that debt. All amounts use integer paise.

Every funds mutation follows the lock order **Order → WalletAccount → Inventory**.
The checkout/payment service owns the outer Serializable transaction. The
exported `withSerializableRetry` retries only serialization/deadlock failures;
the callback must never send network requests, emails or other external effects.
Ledger rows use unique event keys and are append-only; reversals are separate
rows, not edits to prior credits/debits.

1. Authenticated checkout securely resolves a wallet by verified Auth subject.
2. Its order snapshots the exact applied wallet amount and earning policy.
3. Checkout reserves wallet funds and inventory together.
4. Capture consumes both atomically. Released/expired wallet holds are never
   reacquired. Late capture or insufficient funds must enter payment review.
5. Cancellation releases wallet and inventory holds atomically.
6. A bounded maturation job checks authoritative order/payment/shipment data and
   posts each credit once. The root wallet module controls job scheduling.

One fully delivered shipment with a valid timestamp is currently required.
Multiple shipments are held for item-level reconciliation because the existing
schema does not allocate order items to shipments. Manual delivery confirmation
is the current source; tracking alone does not establish eligibility.

## Refunds, returns and the emergency switch

Any recorded refund (including partial), return request, cancellation, RTO or
payment-review state conservatively reverses the original earned reward in full.
Uncredited rewards are permanently suppressed without creating a debit.
Already-spent rewards produce a negative wallet balance. Returning to DELIVERED
does not silently recreate a reversed reward; support must adjudicate separately.

The original **wallet payment** is distinct from earned rewards. It is restored
exactly once only after a full external-cash refund is recorded and the order is
REFUNDED, or after the privileged explicit full-refund flow for a wallet-only
order. Partial refunds do not automatically restore any wallet tender; they need
an item/tender allocation policy and operational reconciliation.

Disabling `HIDI_WALLET_ENABLED` blocks new enrolment/earnings/spending, including
consumption of a not-yet-consumed hold. A payment captured after this switch can
therefore require payment review. Already-consumed holds remain idempotent.
Existing balance/history remains visible, but available spending is zero.
Releases, reward reversals and full tender refunds remain functional while
disabled so liabilities are not hidden or stranded.

## Verification and release gates

`tests/wallet-policy.test.ts` and `tests/wallet-service.test.ts` cover policy,
identity, idempotency and failure behaviour using pure/in-memory test doubles.
They do **not** establish real PostgreSQL lock correctness. Before live enablement,
run database-backed simultaneous checkout/capture/refund tests, restart/retry
tests, and Razorpay test-mode split-tender/full-refund flows. Never announce a
live wallet merely because these unit tests pass.
