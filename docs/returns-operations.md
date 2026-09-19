# HIDI Returns, Exchanges, Inventory and Refund Operations

## Why the order can still be DELIVERED

Forward fulfilment and after-sales are separate lifecycles.

A delivered garment remains factually delivered even when a customer later asks to return one item. HIDI therefore keeps the forward `Order.status` as `DELIVERED` for item-level returns and shows the active `ReturnRequest` status as the primary customer/admin badge.

This prevents a partial return from making an otherwise delivered multi-item order look undelivered or returned in fulfilment reports.

## Customer flow

1. The customer signs in to My HIDI and opens a delivered order.
2. Return/exchange is available for 7 days from confirmed delivery.
3. The customer selects:
   - item and quantity,
   - return or exchange,
   - reason,
   - refund destination for returns,
   - replacement size for exchanges.
4. Creating the request is transactional and immediately holds the order's pending reward accrual.
5. My HIDI displays the after-sales status above the old fulfilment status.
6. A newly raised request can be cancelled by the customer until HIDI approves it.
7. Pickup, refund and replacement tracking details appear back in My HIDI as HIDI updates the request.

## Admin queue

`/admin/orders` has a **RETURNS** filter and shows an after-sales badge whenever an order has active return/exchange work.

The order-detail page contains the operational panel. Do not use the normal order-status button to process returns.

### Return state flow

```
REQUESTED
  -> APPROVED
      -> PICKUP_SCHEDULED
          -> RECEIVED
              -> REFUND_PROCESSING -> REFUNDED
  -> REJECTED

REQUESTED -> CANCELLED  (customer only, before approval)
```

### Exchange state flow

```
REQUESTED
  -> APPROVED  (replacement inventory reserved)
      -> PICKUP_SCHEDULED
          -> RECEIVED
              -> EXCHANGE_SHIPPED  (reserved stock consumed)
                  -> EXCHANGED
  -> REJECTED  (reservation released when applicable)
```

Admin can also mark an approved item directly received when the parcel reaches HIDI without a recorded pickup.

## Inventory rules

- Sale inventory is consumed at successful payment capture.
- A returned item is never added back merely because a customer requested a return.
- HIDI must physically receive and inspect the garment.
- **RESTOCK** increments original-variant on-hand stock and creates an immutable `RETURN_RESTOCK` inventory movement.
- **DAMAGED** records the inspection result but does not increase saleable stock.
- Exchange replacement stock is reserved on approval so another checkout cannot consume it.
- The reservation is released on rejection and consumed when the replacement shipment is recorded.

## Refund rules

### HIDI Wallet

After HIDI marks the returned item received and inspected, **Issue refund** credits the approved item amount through the wallet ledger with one immutable event key per ReturnRequest.

Repeated API calls cannot double-credit the wallet.

### Original payment source

HIDI restores the refund across the original tenders.

- Cash/online portion is sent through Razorpay.
- Wallet-funded portion is restored to HIDI Wallet.
- Split-tender refunds use the original tender ratio where possible and then consume remaining tender balances exactly, including rounding across multiple partial returns.
- HIDI records `REFUND_PROCESSING` before calling Razorpay.
- The return becomes `REFUNDED` only after the signed `refund.processed` webhook is verified against the provider payment.
- A provider response that cannot be reconciled is marked `REVIEW_REQUIRED`; the system deliberately blocks blind retry to avoid a duplicate refund.

For item-level refunds, payment accounting changes but the forward fulfilment state stays `DELIVERED`.

## Wallet rewards

- A new return/exchange immediately changes a pending reward accrual to **HELD**.
- My HIDI displays held rewards separately from spendable/pending rewards.
- Rejected/cancelled/completed-exchange requests are eligible for normal reward reconciliation again.
- The current launch-safe wallet policy conservatively reverses the order's reward when a financial refund is finalized. Partial-return reward re-proration can be introduced later as a separate policy version; it should not be silently changed inside the refund workflow.

## Data-integrity protections

- Serializable transactions protect customer request creation, inventory changes and wallet ledger writes.
- A partial unique database index prevents more than one active request for the same order item.
- Returned quantity cannot exceed the purchased quantity remaining after prior completed requests.
- Refund amounts and tender allocations are non-negative and validated against collected amounts.
- Razorpay provider refund IDs are unique.
- Exchange stock is row-locked before reservation/consumption.
- Inventory is restocked once because only APPROVED/PICKUP_SCHEDULED can transition to RECEIVED.
- Wallet refund credits are idempotent by ReturnRequest ID.

## Required deployment steps

From the repository root:

```bash
git checkout feature/returns-operations
pnpm install
pnpm db:generate
pnpm --filter @hidi/api exec prisma migrate deploy
pnpm test:customer-experience
pnpm build
```

For local development, use `prisma migrate dev` instead of `migrate deploy` if that is the normal HIDI development workflow.

The API environment must have the existing database, admin and Razorpay variables, including a valid `RAZORPAY_WEBHOOK_SECRET`. The Razorpay dashboard must deliver `refund.processed` events to HIDI's payment webhook endpoint.

## Operational items intentionally kept separate

These are not silently simulated by this workflow:

- automatic reverse-pickup booking with a courier;
- WhatsApp/email notifications for each return milestone;
- image/video evidence upload for damaged-product claims;
- promotion-specific return restrictions.

Those should be integrated as explicit modules/policies so they cannot accidentally alter inventory or money movement.
