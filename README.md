# HIDI Commerce — October 3, 2026 V1

> **Restricted office laptop?** You do not need Node.js or Docker locally. Use **GitHub Codespaces + Supabase** and follow [`CLOUD-RUN.md`](./CLOUD-RUN.md).


Production-minded HIDI storefront focused on one conversion path:

**Browse → Love the product → Buy → Pay → Receive**

## Implemented in this build

- Next.js 16 / React / TypeScript storefront
- NestJS 11 / Fastify / TypeScript API
- PostgreSQL + Prisma 7 catalogue and commerce data
- Product collections, products, colour/size variants and live sellable inventory
- Guest cart stored in PostgreSQL only after the first add-to-bag action
- Atomic inventory reservation at checkout (15-minute window)
- HIDI order creation with server-calculated pricing
- Razorpay Orders API integration
- Razorpay Standard Checkout integration
- Mandatory server-side payment-signature verification
- Razorpay payment-status verification
- Razorpay `payment.captured` / `payment.failed` webhook handling
- Idempotent payment/order finalisation
- Paid-cart cleanup
- Automatic expired-reservation cleanup
- `PAYMENT_REVIEW` safety state instead of overselling after a late payment

## Local requirements

- Node.js 24 LTS recommended
- pnpm 10+
- Docker Desktop / Docker Engine (WSL2 is fine on Windows)
- Razorpay account with **Test Mode** API keys

## Start locally

1. Copy `.env.example` to `.env` and `apps/api/.env`.
2. Add your Razorpay **test** key ID, key secret and webhook secret.
3. `corepack enable`
4. `pnpm install`
5. `pnpm db:up`
6. `pnpm db:generate`
7. `pnpm db:migrate`
8. `pnpm db:seed`
9. `pnpm dev`
10. Open `http://localhost:3000`.

The API runs at `http://localhost:4000/v1`.

## Razorpay test setup

Configure a webhook in Razorpay Test Mode pointing at:

`https://<public-api-host>/v1/payments/razorpay/webhook`

Subscribe to at least:

- `payment.captured`
- `payment.failed`

Set the same webhook secret in `RAZORPAY_WEBHOOK_SECRET`.

For local webhook testing, expose port 4000 through your preferred secure tunnel. Never put `RAZORPAY_KEY_SECRET` or the webhook secret in the Next.js environment.

## Inventory rules

`available = onHand - reserved - safetyStock`

Adding to bag **does not reserve stock**. Pressing **Pay securely** atomically locks the inventory rows and reserves the requested variants for 15 minutes. A captured payment consumes the reservation and decrements on-hand stock. Expired unpaid reservations are released automatically.

## Important before live launch

Replace seed products and placeholder imagery with the approved HIDI product master; configure live Razorpay keys and webhook; connect S3/CloudFront product media; finalise shipping/return rules; configure production PostgreSQL backups; add monitoring/alerts; and run load + end-to-end payment tests.

The V1 remains a modular monolith intentionally. It is much safer to operate for launch than premature microservices, while the catalogue, cart, checkout, order and payment boundaries can be split later if HIDI traffic demands it.
