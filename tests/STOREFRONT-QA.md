# Storefront QA: repeatable checks and staging sign-off

## Run the offline suite

After installing the repository dependencies, run from the repository root:

```sh
node --test tests/storefront-qa.test.cjs
```

The suite uses the installed React, ReactDOM server renderer and TypeScript,
plus Next's bundled HTML parser and its PostCSS dependency. No extra packages,
credentials, database, browser or external network are required. A network call
from the component sandbox fails the test.

The suite has 22 tests. It runs the actual homepage, product-review and product
contact component source. Next Link and Image are rendered as native adapter
elements; homepage product cards are placeholders so the tests isolate the
brand-standard block. CSS Modules are parsed into local class names.

## What passing proves

- The brand-standard block selects up to four distinct product identities and
  image URLs, looks beyond the first eight catalogue entries, suppresses a
  misleading single-garment collage, labels imagery and links to the collection.
- Empty reviews do not advertise a zero-star/count score. Published reviews have
  accessible rating text; verified badges follow the actual verification flag.
  Customer review strings are escaped. Review guidance is a native disclosure
  and correctly explains private emailed invitations, rather than pretending
  an account link is a review form.
- The initial product-contact markup connects labels and descriptions to real,
  unique IDs. Unconfigured WhatsApp controls are disabled. Size is not silently
  selected; sold-out options and the unverified-stock continuation are disabled.
  The handoff note does not claim an order or stock reservation exists.
- The checked CSS declarations preserve equal garment columns, 48px-or-larger
  primary controls, a bounded 560px desktop modal, a mobile bottom sheet,
  scrollable content, safe-area padding, visible focus and reduced motion.
- A source-level regression guard preserves native `showModal`, cancellation,
  scroll restoration, focus-return and abort hooks. It does **not** execute
  those hooks in a browser.

## What passing does not prove

These are isolated server-render/parsed-DOM tests and CSS contract checks, not
browser E2E, hydration, screenshot, layout-engine or assistive-technology tests.
The installed Next guide recommends E2E coverage for async Server Components;
directly awaiting the homepage here covers its selection/render logic only.

Actual fonts, photographs, image loading/optimization, final production CSS
ordering, overflow, pixel alignment, touch behavior, native dialog focus,
Escape/backdrop dismissal and keyboard restoration remain staging checks.
The current mobile modal close button is 40px square; consider a 44px comfort
target in a later authorized UI edit. This observation alone is not a WCAG
conformance assessment.

No browser automation was used. The previous browser access blocker was not
bypassed, and no live WhatsApp conversations or notifications were sent.

## Manual staging checklist — still required

Use the authorized staging build with test catalogue/review data, not customer
orders. Keep WhatsApp automation disabled. Do not continue into an external
WhatsApp conversation unless an approved test recipient and testing scope have
been established separately.

- [ ] Check the production build at 360px, 390px, 768px and 1440px widths, plus
      200% zoom. Inspect actual image crops, names wrapping and page overflow.
- [ ] Confirm four different garments have equal visual prominence. Check two,
      three, one and zero valid-photo catalogue states.
- [ ] Inspect both zero-review and genuine populated-review states. Tab to the
      review disclosure; open/close it with keyboard and touch. Confirm it does
      not redirect to a nonexistent review form.
- [ ] With WhatsApp unconfigured, confirm the reason is visible and normal
      Add to Bag/checkout remain available.
- [ ] If a separately approved staging number is configured, open the product
      selection only. Check desktop modal/mobile bottom-sheet sizing, scrolling,
      focus placement, Tab/Shift+Tab containment and background inertness.
- [ ] Close by its button, Escape and outside click. Confirm focus returns to
      the trigger and body scrolling resumes in each case.
- [ ] Using staging fixtures, check stock-check delay, timeout and failure,
      sold-out options, missing photographs, long names, colour changes and
      quantity limits. Verify the continuation cannot bypass fresh stock data.
- [ ] Exercise price/stock changes between opening and continuation with a
      stubbed handoff. Confirm the updated choice requires review and no real
      order, reservation, payment or message is created by these UI checks.
- [ ] Recheck unchanged header navigation, wishlist, bag and checkout; record
      any browser/console failures and screenshots with the tested build SHA.

Do not mark staging or visual QA complete from this offline suite alone.
