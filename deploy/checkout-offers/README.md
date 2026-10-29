# Welcome and ₹1 dress offers

Owner controls: `/admin/offers`. Save drafts, select a private test audience or
everyone, and publish. Each offer has its own enable checkbox; the master checkout
checkbox controls redemption. Legacy drafts display the new models with checkout
off and no selected gift products. The old 15% checkout discount is unsupported.

* `WELCOME200`: ₹200 off current selling-price merchandise at ₹1,499 or above,
  once per new customer. Verified phone identity, prior paid/refunded orders and
  active orders are checked on the server.
* `DRESS1`: at ₹2,999 or above, add one selected available variant for ₹1. Delivery
  and the additional dress do not qualify toward the threshold. First 25 orders,
  one per verified customer. The owner maps the below-₹550 purchase-cost list to
  website products; MRP is not a purchase-cost proxy.
* One offer per order; wallet reward redemption cannot stack. Existing merchandise
  prices and shipping policy are preserved. Taxes remain included in prices.

The serializable checkout transaction takes a SQL Server transaction-owned
`sp_getapplock` before checking redemption history and creating the order/stock
reservations. Pending orders temporarily occupy places until cancelled by the
existing reservation-expiry process. Consumed inventory records a completed
redemption, including after returns/refunds. COD orders reserve/consume a place
on confirmation. Late captures in payment review cannot reclaim released places.
The fixed rule-set identifier in order snapshots survives edits and republication;
publishing a version never resets the cap. No schema migration is required.

Release with the `[checkout-offers]` commit marker to suppress the older web-only
offers release. `checkout-offers-release.yml` snapshots both production images,
checks the real retained CheckoutService against isolated data, tests the admin
and checkout in Chromium/Firefox/WebKit on desktop and mobile, and deploys only
the tested overlays with ownership-aware rollback. Production payment tests are
read-only; no customer orders are created by the release.

Local checks: `node --test deploy/offers/model.test.mjs deploy/offers/handler.test.mjs`.
Runtime checks: `HIDI_CANDIDATE_API` points to an extracted candidate `/app`, then
`node deploy/checkout-offers/api-test.mjs`. The fixture covers amount boundaries,
provider amounts, saved discounts, stock, identity, rewards, retries, the 25-order
cap, pending holds, returns and concurrent attempts using serialized transactions.
