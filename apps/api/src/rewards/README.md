# HIDI reward preview foundation (not a wallet)

This read-only foundation demonstrates the approved earning rate: **2 points per
complete ₹100; 1 point = ₹1**. A ₹2,000 qualifying merchandise amount estimates
₹40, not ₹40 of spendable credit. Nothing writes a ledger or modifies checkout.

## Feature flag and API

- Default is disabled. Enable only in a controlled preview with
  `HIDI_REWARDS_PREVIEW_ENABLED=true`.
- Set `HIDI_REWARD_RETURN_WINDOW_DAYS` to an explicitly approved whole number
  from 1 to 365. There is no default; missing/invalid values hold all estimates.
- `GET /rewards/summary` requires a server-verified bearer token and verified
  email. Only that account's orders and unclaimed guest orders matching its
  verified email are included. The endpoint does not claim or update orders.
- All responses say `mode: PREVIEW`, `spendablePaise: 0`, and carry a notice that
  estimates are not wallet balances. Do not relabel estimated eligibility as
  "available rewards" or show it as checkout savings.
- Results include at most the newest 100 orders. `coverage.truncated` indicates
  older orders were omitted: totals must not be presented as lifetime totals.
  More than 20 payments or shipments on an order holds that order rather than
  accidentally approving it from a truncated relation read.

## Illustrative calculation and safety

The *proposed, not yet approved* basis is order subtotal minus order discount;
shipping and separately recorded tax are excluded. Tax-inclusive catalogue
amounts are not decomposed. Final qualifying spend and treatment of offers,
tax, birthday discounts, partial returns and wallet-funded purchases still
need business approval. Integer paise and complete ₹100 blocks prevent floating
point errors. Fractions of a paise and inconsistent totals hold the order.

Only fully captured INR payments can produce an estimate. Cancellations,
refunds, partial refunds, return requests, payment review, RTO/cancelled
shipments and incomplete relation reads hold the order. Eligibility requires
the order and every recorded shipment to be delivered with valid delivery
timestamps. Its date is the latest actual delivery plus the configured return
window. Missing dates, impossible/future dates and undelivered split shipments
cannot mature rewards. Awaiting-delivery estimates have no invented release
date. This does not assert item-level fulfillment completeness: the existing
schema has no shipment-to-item allocation. A production ledger must verify
that all non-returned items were delivered.

## Still required for production

1. Business-approved qualifying spend, tax, return duration, offer stacking,
   redemption limits, expiry and handling of returned/replaced items.
2. A durable, idempotent credit/debit/reversal ledger with unique event keys,
   transaction-safe redemption/reservation and concurrent checkout tests.
3. Authoritative payment/refund and item-level delivery/return reconciliation,
   including chargebacks and late returns.
4. Wallet UI, real checkout redemption, audit/admin support, and staged rollout.
5. Separately approved consent-aware notifications; this module sends none.

Pure policy tests live in `tests/rewards-preview.test.ts`; no database, payment
provider or customer messaging is used by them.
