# HIDI API V1

Base path: `/v1`

## Health and catalogue

- `GET /health`
- `GET /products`
- `GET /products?category=work-edit`
- `GET /products/:slug`

Product responses expose variants with a calculated `available` quantity. Database inventory internals such as `reserved` and `safetyStock` are not exposed to the storefront.

## Guest cart

- `GET /carts/:sessionId`
- `POST /carts/:sessionId/items`
  - body: `{ "variantId": "...", "quantity": 1 }`
- `PATCH /carts/:sessionId/items/:itemId`
  - body: `{ "quantity": 2 }`
- `DELETE /carts/:sessionId/items/:itemId`

A GET for a new visitor returns a virtual empty cart and does not create a database row.

## Checkout

- `POST /checkout/prepare`

Example body:

```json
{
  "sessionId": "browser-uuid",
  "checkoutToken": "idempotency-uuid",
  "customerEmail": "customer@example.com",
  "customerPhone": "9876543210",
  "shippingAddress": {
    "firstName": "Ananya",
    "lastName": "Nagalla",
    "phone": "9876543210",
    "line1": "Delivery address",
    "line2": "Optional landmark",
    "city": "Hyderabad",
    "state": "Telangana",
    "postalCode": "500001",
    "countryCode": "IN"
  }
}
```

The API re-reads current prices, locks inventory, reserves stock, creates the HIDI `PENDING_PAYMENT` order and then creates a Razorpay Order. Browser-submitted prices are never trusted.

## Payments

- `POST /payments/razorpay/verify`
  - receives `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature` from Checkout
  - verifies the signature using the provider order ID stored by HIDI
  - fetches the provider payment and checks order ID, amount, currency and capture status
- `POST /payments/razorpay/webhook`
  - verifies `x-razorpay-signature` against the raw request body
  - handles `payment.captured` and `payment.failed`

A captured payment finalises the order idempotently. If a very late payment can no longer be reconciled with inventory, the order is moved to `PAYMENT_REVIEW` for operations instead of overselling.
