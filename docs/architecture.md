# HIDI V1 Architecture

## Runtime request path

Customer → CDN/WAF → Next.js storefront → NestJS/Fastify API → PostgreSQL

Supporting services:

- Valkey/Redis-compatible cache is provisioned in the local stack and can be introduced for hot catalogue/session workloads without changing commerce ownership.
- S3 + CloudFront are the target for production product media.
- Razorpay owns payment collection; HIDI stores provider IDs/statuses, never card data.
- Queue-backed notifications/shipping events are the next post-checkout slice.

## Domain boundaries in the modular monolith

- catalogue / collections
- variants / inventory
- cart
- checkout / reservations
- orders
- payments
- shipping (schema ready; workflow next)
- promotions
- notifications
- admin

## Consistency rules

- PostgreSQL is the source of truth for price, inventory, orders and payment state.
- Storefront price/stock values are advisory; checkout recalculates everything on the server.
- Inventory reservation uses database row locks inside serializable transactions.
- Checkout uses an idempotency token.
- Payment finalisation is idempotent and can be reached from browser verification or webhook delivery.
- API instances remain stateless so they can scale horizontally.

## Launch scaling principle

Do not introduce microservices before October 3. Put the stateless API behind managed horizontal autoscaling and keep durable business state in PostgreSQL. Extract high-volume domains later only when measurements justify it.
