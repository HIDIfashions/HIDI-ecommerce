# HIDI performance phase 1: non-blocking homepage and bounded catalogue reads

Base: `feature/premium-storefront-v1` at `bdc8b34ac3a15f5d0ce588168d0a83a18e262a26`.

## Changes

- The homepage shell no longer awaits featured products. A local React Suspense boundary streams the four product cards. Existing loaded-page markup, CSS, imagery, navigation, offers and shopping actions are preserved. Only loading/failure states are added.
- Catalogue list GETs have a shared 8,000 ms production budget, a 4,000 ms per-attempt ceiling and at most two attempts. The budget includes response-body decoding. Development retains up to 15 readiness attempts within 25,000 ms.
- Retry only network failures/timeouts and HTTP 500/502/503/504. Do not retry 4xx, rate limits, invalid JSON or wrong response shapes.
- Featured-product errors render a recoverable message rather than an apparently empty edit. Other existing list callers retain their empty-array fallback contract in this scoped patch.
- Related recommendations fall back only after a successful empty response or a legacy 404. The fallback shares the remaining time budget and requests `limit + 1` cards (five for the default four), rather than the whole catalogue. The products controller passes this optional limit to the existing bounded service method. An outage does not trigger another catalogue query.
- Stock-bearing responses remain `no-store`. No transaction, authentication, wallet, pricing, payment, inventory or database-schema changes.

## Validation performed locally

`node --experimental-strip-types --test tests/catalogue-performance.test.mjs`

28 tests passed on Node 22.16.0. Tests exercise actual helpers, local HTTP servers with stalled headers/bodies, retry behaviour, API fallback paths, and source-structure/controller-body regressions. Timing fixtures are synthetic; they are NOT a live-site speed benchmark.

Strict TypeScript checking passed for `api.ts` and `public-read.ts` with a local process-env declaration. TypeScript/JSX syntax transpilation passed for the homepage and controller. This is NOT a full Next.js/NestJS production build or a rendered-browser layout test.

The quality gate now also covers PRs targeting the current storefront branch and runs these tests before the existing dependency installation, customer-experience tests, wallet tests and production build.

## Release gate

1. Require the full CI build and existing tests to pass. Do not merge while failing.
2. Deploy the API controller and web application from the same reviewed commit to staging. An old API ignores the new limit parameter, so the fallback query reduction requires the backend update too.
3. Compare the current and proposed deployments with the same data, region, mobile viewport, network profile and cache state. Measure HTML first byte, hero LCP, catalogue/related request duration, transferred image bytes and layout shift. Compare cold and warm requests separately.
4. Inject a slow featured API in an isolated test environment: verify that the hero/header are visible before the cards, that placeholders reserve reasonable space, and that failure shows a recoverable message. Source-structure tests do not prove real CDN streaming or pixel-perfect placeholder heights.
5. Smoke-test sign-in, size selection, cart quantities, checkout, payment-test callbacks, order visibility and wallet correctness. This patch leaves their code unchanged, but integration verification remains required.
6. Only then merge/deploy. Roll back by reverting the performance commit; no data migration or DNS change is needed.

## Remaining work

Live mobile measurements, product-page review/recommendation streaming, image size/priority auditing, query and connection tracing, safe cache separation/invalidation, and load testing are not completed by this patch. `getProduct` and `getProductReviews` retain their existing request behaviour. Do not describe phase 1 as a complete performance fix.
