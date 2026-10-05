# HIDI Mobile Premium V2 — build architecture

Branch: `hidi-mobile-premium-v2`
App path: `apps/mobile`
Native application identity: `com.thehidi.app`

## Target stack
- React Native 0.87.x, React 19 and TypeScript.
- React Native New Architecture/Fabric.
- NativeWind 4.2.7 with Tailwind CSS 3.4.x.
- React Native Reanimated 4.x and Gesture Handler 3.x.
- Gorhom Bottom Sheet 5.x.
- Shopify FlashList 2.3.x for product feeds.
- React Navigation 7.
- Stripe React Native provider adapter for a later approved payment phase; no fake payment handoff.

## Application layers
- `src/app`: providers, error boundary and bootstrap.
- `src/navigation`: root stack and five fixed tabs.
- `src/features`: home, trends, catalog, product, bag, checkout, profile and insider.
- `src/components`: design-system primitives only.
- `src/services/api`: typed API client and verified endpoint adapters.
- `src/services/cache`: query/image/local persistence policies.
- `src/store`: ephemeral UI state; canonical commerce state remains server-owned.
- `src/theme`: NativeWind tokens, typography, elevation and motion constants.

## Existing ecosystem
Staging storefront: `https://thidigk.thehidi.com`
Staging store API: `https://thidigk.thehidi.com/api/store`
Production storefront: `https://thehidi.com`
Production store API: `https://thehidi.com/api/store`

The current public product feed exposes products, category, collections, images and variant inventory. Cart, account and checkout routes will be verified against source before wiring.

## Performance budget
- FlashList for infinite feeds and catalogues.
- Image component abstraction with progressive placeholders, cache policy and retry state.
- Skeletons for every network-fed section.
- Abortable requests, stale-data handling and checkout error boundaries.
- Stable product-card dimensions to prevent layout shifts.
- Deferred non-critical modules after first useful content.

## CI gate
- Dependency lock and reproducible install.
- TypeScript and unit/component tests.
- Android debug/release compilation.
- iOS simulator compilation.
- Screenshot checks at 320/360/390/430dp and large text.
- Installed-app smoke tests before any APK handoff.
