# HIDI Android Commerce UI Standard

## Product principle
HIDI Android is an app-first commerce product. It does not inherit web layouts. It uses HIDI data and commerce APIs, but navigation, discovery, product presentation, saved state, cart and account surfaces are native.

## Navigation standard
Five primary destinations:
1. Home
2. Shop
3. HIDI TV
4. Wishlist
5. Account

Search and Bag are globally accessible from the top app bar. Product detail, filters, search results and checkout are secondary destinations and must preserve the previous screen state.

## Home standard
Home must contain, in this order:
- Brand app bar + Search entry + Bag
- Quick category circles
- Campaign hero carousel
- New & Trending horizontal rail
- Shop by Occasion
- HIDI TV / shoppable content preview
- Ananya's Picks
- Price-led discovery
- Recently/curated recommendations when data is available
- Rewards / trust strip

## Shop standard
- Category navigation independent from Home
- Product listing is a clean two-column image grid
- Sticky Sort and Filter actions
- Filter state survives PDP navigation
- Filters: size, colour, collection/occasion, price and availability where supported
- Sort: recommended, newest, price low-high, price high-low
- Empty state always gives a clear reset action

## Product detail standard
- Swipeable image gallery
- Wishlist
- Product rating + review count where available
- Colour selection
- Size selection with stock state
- Low-stock warning by size
- Fit / garment measurement information where available
- Delivery, exchange and product details
- Sticky Add to Bag
- Recommendations / complete-the-look when data is available
- Back returns to exact previous browsing state

## HIDI TV standard
- Vertical, visual, shoppable content feed
- Product overlay with direct PDP navigation
- Creator / Ananya edit support
- Video-ready architecture; image/editorial fallback until video assets are published

## Wishlist standard
- Persistent locally without sign-in
- Account sync can be added when backend support is available
- Product grid matches Shop cards
- Empty state routes to Shop

## Bag standard
- Product, size, colour, quantity, price
- Free-shipping progress
- Rewards callout
- Quantity update / remove
- Single checkout CTA
- No marketing clutter blocking checkout

## Account standard
- Optional login
- Orders
- Returns / exchanges
- Refund status
- Wallet / rewards
- App Inbox
- Preferences / notifications
- Help & support
- Store locator only when store-location backend is available

## Interaction & quality standard
- 48dp minimum tap targets
- Native back behavior
- Preserve scroll/filter/search state
- Skeleton/loading states instead of blank screens
- No infinite duplicated lists
- Wishlist and cart must persist across app restarts
- Image loading must not block interaction
- No mandatory login for browsing
- UI uses HIDI-specific design tokens, not website CSS or layout
