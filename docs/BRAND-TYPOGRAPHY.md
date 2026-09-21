# HIDI Typography Standard

HIDI uses a restrained two-font system designed for a premium global fashion storefront.

## Brand fonts

- **Manrope** — navigation, body copy, buttons, forms, prices, metadata and operational UI.
- **Cormorant Garamond** — hero lines, collection titles, section headings and selective editorial/product titles.
- The HIDI logo remains artwork; never recreate the wordmark with a substitute typeface.

Both fonts are loaded through `next/font`, so Next.js self-hosts and optimizes the files at build time.

## Rules

1. Use no more than these two font families in storefront UI.
2. Default body text is 16px with approximately 1.6 line-height.
3. Do not add text below 12px unless it is genuinely decorative and non-essential.
4. Reserve uppercase + tracking for navigation, eyebrows, buttons and short labels. Do not use it for paragraphs.
5. Use only 400, 500, 600 and 700 weights. Prefer 400 for copy, 500 for editorial headings, 600–700 for controls and emphasis.
6. Use sentence case for customer-facing headings and labels unless a component is intentionally an uppercase UI label.
7. Keep paragraphs concise. Marketing copy should generally stay within 45–70 characters per line.
8. Prices and totals use the sans family, stronger weight and tabular numerals for clean alignment.
9. Never introduce a page-specific `font-family`. Extend the tokens in `globals.css` only if the brand system itself changes.
10. Avoid decorative clutter: no gratuitous italics, excessive bolding, emoji in commerce UI, multiple accent styles, or long all-caps messages.

## Hierarchy

- Hero H1: Cormorant Garamond 48–76px, medium
- Page/collection title: Cormorant Garamond, medium
- Section heading: Cormorant Garamond, medium
- Product title: Cormorant Garamond 18px, medium
- Body: Manrope 16px, regular
- Supporting copy: Manrope 13px
- Navigation/button/eyebrow: Manrope 12px, semibold/bold
- Fine print/metadata: Manrope 12px minimum

## Content tone

HIDI copy should be calm, specific and confident. Prefer short factual phrases over hype.

Good: "Soft cotton. Easy through the day."
Avoid: "UNBELIEVABLE MUST-HAVE LOOK!!!"

Good: "Free shipping above ₹1,999"
Avoid: "Hurry!!! Grab this amazing deal now"

This file is the typography source of truth for future storefront work.
