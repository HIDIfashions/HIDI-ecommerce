# HIDI Returns / Exchanges QA

Use a test customer, test Razorpay credentials and disposable SKUs. Confirm database migration and Prisma generation first.

## 1. Customer request visibility

- Deliver a paid test order.
- Open My HIDI and raise a return.
- Expected: order card primary badge changes from **Delivered** to **Return · Requested**.
- Expected: fulfilment is still stored as DELIVERED internally.
- Expected: wallet reward moves from Pending to Held.
- Refresh/re-login; the status must persist.

## 2. Admin awareness

- Open Admin -> Orders.
- Expected: the order shows an after-sales badge even in the normal list.
- Select **RETURNS** filter.
- Expected: the order is present and the "Returns to action" count is non-zero.
- Open the order and confirm the Returns & exchanges operations panel shows item, reason, quantity, amount and customer choice.

## 3. Customer cancellation

- Raise another fresh request and click **Cancel request** before admin approval.
- Expected: request becomes CANCELLED.
- Expected: it disappears from active RETURNS queue.
- Expected: no inventory or refund movement occurs.
- Expected: reward reconciliation can resume.

## 4. Wallet return

- Raise RETURN with refund destination HIDI Wallet.
- Admin: Approve -> record/schedule pickup -> Mark received & inspected = RESTOCK -> Issue refund.
- Expected: original variant onHand increases exactly once at receive/inspection.
- Expected: inventory movement type RETURN_RESTOCK exists with ReturnRequest reference.
- Expected: wallet gets exactly the approved refund once with ledger kind RETURN_REFUND.
- Repeat/refresh admin action; no second credit is possible.
- My HIDI shows REFUNDED and the wallet activity says "Return refund credited."

Repeat with inspection = DAMAGED:
- Expected: refund may proceed.
- Expected: onHand does NOT increase.

## 5. Cash / Razorpay return

- Use a cash-only Razorpay test order.
- Process return through RECEIVED.
- Click Issue refund.
- Expected: request becomes REFUND_PROCESSING.
- Expected: it is not marked REFUNDED only because the API call returned.
- Deliver a valid signed Razorpay refund.processed webhook.
- Expected: PaymentRefund record is created, Payment is PARTIALLY_REFUNDED or REFUNDED as appropriate, ReturnRequest becomes REFUNDED.
- Expected: forward Order.status remains DELIVERED for an item-level return.

Replay the same webhook:
- Expected: no duplicate refund record, wallet movement or status corruption.

## 6. Split Wallet + Razorpay refund

- Pay an order partly with HIDI Wallet and partly with Razorpay.
- Return one item to Original payment source.
- Expected: admin return panel records refundWalletPaise + refundCashPaise = item refundPaise.
- Expected: cash portion never exceeds remaining captured Razorpay amount.
- Expected: wallet portion is credited only once.
- Return remaining item(s); cumulative wallet/cash restorations must never exceed their original collected tenders.

## 7. Exchange

- Deliver a product that has another size in stock.
- Customer requests exchange.
- Admin approves.
- Expected: requested variant `reserved` increases by exchange quantity.
- Reject an approved test request.
- Expected: reservation is released.

For a second exchange:
- Approve -> pickup -> receive/inspect -> ship exchange.
- Expected at receive/restock: original variant onHand increases if RESTOCK selected.
- Expected at replacement shipment: replacement onHand and reserved both decrement by exchange quantity.
- Complete exchange.
- Expected: request becomes EXCHANGED and rewards resume normal reconciliation.

## 8. Concurrency / negative cases

- Double-click customer submit: only one active request for an order item is allowed.
- Try to return more than remaining purchased quantity: request rejected.
- Try to approve an exchange after another checkout consumes the last available replacement: approval rejected without reservation.
- Try to issue refund before RECEIVED: rejected.
- Try to mark RECEIVED twice: second call rejected; inventory does not increment twice.
- Try to ship exchange without AWB: rejected.
- Try a second refund while REFUND_PROCESSING: rejected.
- Simulate provider refund response mismatch: request goes to REVIEW_REQUIRED and must not be blindly retried.

## Launch gate

Do not merge/deploy until all of these pass:

```bash
pnpm db:generate
pnpm --filter @hidi/api exec prisma migrate deploy
pnpm test:customer-experience
pnpm build
```

Also perform at least one real Razorpay test-mode refund webhook end to end; unit tests cannot validate dashboard/webhook configuration.
