# HIDI Order Operations Audit Timeline

## Purpose

HIDI now keeps an append-only operational history for each order so support and operations can reconstruct what happened across checkout, payment, fulfilment, returns, exchanges, inventory and refunds without relying on the current order status alone.

The timeline is an internal operations record. It is not a customer-visible activity feed.

## Data model

`OrderAuditEvent` stores:

- order and related entity identifiers;
- event type;
- actor type and actor identifier;
- previous and next status where applicable;
- monetary amount in paise where applicable;
- idempotency event key;
- provider/request correlation identifier;
- source subsystem;
- bounded JSON metadata;
- immutable creation timestamp.

The table has no public Supabase/Data API policy, public/anonymous/authenticated privileges are revoked, and a database trigger rejects UPDATE and DELETE. Corrections must be represented by a new event.

Orders referenced by audit history cannot be deleted. Operational data should be archived by policy rather than hard-deleted.

## Idempotency

Provider and lifecycle events use stable event keys such as:

- `order:<orderId>:created`
- `order:<orderId>:status:DELIVERED`
- `payment:<providerPaymentId>:captured`
- `refund:<providerRefundId>:processed`
- `return:<returnRequestId>:approved`

A repeated provider webhook therefore cannot create duplicate audit events.

## Current event coverage

The audit stream records:

- order creation and checkout cancellation;
- Razorpay payment order creation, payment capture and payment failure;
- wallet-only payment capture;
- order confirmation, packing, shipping and delivery;
- shipment preparation;
- return/exchange request and customer cancellation;
- approval/rejection;
- pickup scheduling;
- receipt/QC and inventory disposition;
- refund initiation, provider acceptance/failure/review and completion;
- exchange shipment and completion.

## Backfill

Historical orders created before this feature cannot have their complete intermediate history reconstructed safely.

The migration therefore adds only:

1. `ORDER_CREATED` at the original order creation time; and
2. `CURRENT_STATE_BASELINE` at the order's current `updatedAt` time.

The baseline is explicitly marked `MIGRATION_BACKFILL`. It must not be interpreted as proof of every intermediate historical transition.

## Admin UI

The order detail page displays the newest events first under **Operations Timeline**. The API returns at most 200 events for the order detail view to keep payloads bounded.

For long-term enterprise scale, older audit rows can be moved to archival storage while preserving the same immutable event identifiers.

## Privacy rules

Do not write full addresses, OTP values, access tokens, card/payment credentials, secrets or full request payloads into audit metadata.

Use identifiers and operational facts only. Provider references may be stored because they are required for reconciliation.

## Deployment

After switching to the audit branch:

```bash
pnpm install
pnpm db:generate
pnpm --filter @hidi/api exec prisma migrate deploy
pnpm test:customer-experience
pnpm test:wallet-db
pnpm build
```

The migration must be applied before starting API code that writes `OrderAuditEvent`.
