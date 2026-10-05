# HIDI Mobile Premium V2 — product brief

## Direction
Create a fashion-first, high-conversion HIDI application with the energy and interaction quality of leading Indian fashion marketplaces while keeping HIDI's own logo, merchandising, imagery and voice.

## Website findings used as source
The current storefront provides edge-to-edge editorial assets, `collections/all`, New Arrivals, Work Edit and Occasion routes, account routes for orders/returns/rewards/preferences, and a public product feed containing categories, collections, images and variants. The mobile application will use those real contracts instead of hard-coded taxonomy.

## Navigation
1. Home
2. Trends
3. Categories
4. Bag
5. Profile

The bottom bar is persistent, safe-area aware and keyboard aware. Bag count and active state use the pink accent. At large text sizes the bar adapts rather than truncating labels.

## Screen 1 — Infinite Home Feed
- Compact HIDI header with search, wishlist and profile affordances.
- Circular story bubbles for New Arrivals, Work Edit, Occasion, Best Sellers and editorial stories.
- Edge-to-edge hero carousel with one clear CTA.
- Contextual campaign countdown shown only when the backend provides a campaign end time.
- FlashList-backed two-column product feed using 4:5 media.
- Product card: brand/edit label, product name, sale price, original price, discount badge, colour count and animated wishlist.
- Pull-to-refresh, pagination, skeletons, partial section recovery and weak-network states.

## Screen 2 — Smart Catalog and Filters
- Two-column product grid with sticky result count and sort/filter controls.
- Bottom-sheet filter workspace for category/brand, price, size, colour and discount tier.
- Instant local preview against loaded data, followed by canonical server query when supported.
- Removable filter chips, clear-all and zero-result recovery.
- Sort options: recommended, newest, price, popularity and discount only when the API supports stable semantics.

## Screen 3 — High-Value PDP
- Edge-to-edge image carousel with zoom, pagination and video slot support.
- Product title, rating, sale price, original price and percentage discount.
- Colour and size selection through spring bottom sheets.
- Size predictor that is feature-gated until an approved recommendation contract exists.
- Delivery PIN check, returns summary, reviews and collapsible specifications/care.
- Sticky bottom bar with Wishlist and Add to Bag; Add is disabled until an exact available SKU is selected.

## Screen 4 — Live Bag
- Swipe-to-remove with undo and explicit accessibility alternative.
- Exact SKU, quantity stepper and live canonical totals.
- Coupon input, shipping-threshold progress and Insider benefit state.
- Cross-sell recommendation rail that never mutates the bag automatically.
- Checkout steps: Address, Order Summary and Payment.
- Payment provider UI is isolated behind an adapter; Apple Pay, Google Pay and Stripe require server PaymentIntent and reconciliation support.

## Premium mechanics
- Heart-pop scale animation with haptic feedback.
- Product-card press expansion with spring physics.
- Bottom-sheet size/filter transitions with gesture continuity.
- Reduced-motion fallback.
- No animation may delay Add to Bag, checkout or accessibility focus.
