# Checkout and Inventory Flow

```text
Product page
   │
   ├─ select colour + size
   ▼
Database-backed cart
   │        (no reservation yet)
   ▼
Checkout / Pay securely
   │
   ├─ server recalculates price
   ├─ PostgreSQL locks every requested Inventory row
   ├─ verifies sellable quantity
   ├─ increments Inventory.reserved
   ├─ creates InventoryReservation (15 min)
   ├─ creates HIDI PENDING_PAYMENT order + immutable item snapshots
   ▼
Razorpay Order API
   │
   ▼
Razorpay Standard Checkout
   │
   ├─ payment result returned to browser
   ▼
HIDI server signature verification
   │
   ├─ fetch Razorpay payment
   ├─ verify provider order ID
   ├─ verify amount + INR currency
   ▼
Captured?
   ├─ yes → onHand decreases, reserved decreases, reservation CONSUMED,
   │         order CONFIRMED, cart cleared
   └─ not yet → keep PENDING_PAYMENT and wait for webhook

Razorpay webhook is an independent confirmation path. Repeated callbacks are safe.
```

## Why the reservation starts at checkout

Reserving inventory on add-to-cart lets abandoned carts block popular sizes. HIDI therefore keeps carts non-reserving and creates a short reservation only when the customer starts payment.

## Late-payment safety

If a reservation has already been released when a captured payment arrives, HIDI attempts to fulfil against current sellable inventory under a database lock. If it is no longer safe, the payment is recorded as captured and the order is moved to `PAYMENT_REVIEW`; it is never silently oversold.
