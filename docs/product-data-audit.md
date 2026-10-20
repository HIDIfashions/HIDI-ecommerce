# Product data audit — 20 October 2026

Audited 54 published products and 247 variants against the original product workbook. The source workbook contains 69 entries; 26 published products have a unique matching style code. Only explicit, traceable source specifications were added. This confirms records, not physical garment testing.

## Findings

- Numeric measurements: none populated for any of the 247 published variants. No size chart values were invented.
- Confirmed specifications added for 26 uniquely matched products. Each displayed field retains its source sheet and row in the audit JSON.
- 28 products have no unique source record by their current variant codes. No fuzzy name, colour, photograph or positional matching was used.
- The workbook repeats HIDI_040. It does not provide a unique HIDI_041 entry. These records require identity reconciliation before enrichment.
- Live catalogue identity, name, fabric or description changes invalidate the stored specification review until it is rechecked.

Three products explicitly say “with lining” within the workbook fabric field and already list lining in the live catalogue. Those statements were cross-checked without asserting lining fabric or duplicating the displayed row.

## Fuchsia product — HIDI_019

Source: original workbook, Sheet1 rows 661–692.

| Added detail | Confirmed value | Source row |
| --- | --- | --- |
| Neckline | Mandarin Collar with V-Slit | 677 |
| Front detail | Decorative Button Detailing | 678 |
| Sleeves | Three-Quarter Sleeves | 679 |
| Top length | Long Kurta | 681 |
| Side detail | Side Slits | 683 |
| Bottom length | Ankle Length | 689 |

Not added or overridden:

- Measurements: absent for M, L, XL and XXL.
- Model height and worn size: absent; current Model field incorrectly contains set contents.
- Fibre percentages, lining, pockets and waistband: not confirmed for this product.
- Fabric: structured live value is Cotton; workbook says Cotton Flex. Cotton remains the existing label; no composition percentage is asserted.
- Fit: live summary says Relaxed Fit; workbook separates Straight-Fit Kurta from Comfortable Fit pants. No combined fit claim was added.
- Technique: workbook says print; live narrative says embroidery. The presentation continues to avoid a disputed technique claim.

## Missing or incomplete information

Counts refer to products, not variants. Measurements must be recorded per applicable variant, with units and whether they describe the body or finished garment. Waist and hip must identify circumference versus flat width.

| Field needing confirmation | Products |
| --- | --- |
| Bust | 54 |
| Waist | 54 |
| Hip | 54 |
| Shoulder | 54 |
| Sleeve length | 54 |
| Garment length | 54 |
| model height and worn size | 54 |
| lining confirmation | 51 |
| pocket confirmation | 54 |
| waistband confirmation | 54 |
| fibre composition percentages | 54 |

## Product action list

Use the JSON report for individual source references and conflict reasons. Source-code matching deliberately leaves unmatched records unresolved.

| Product | Source code | Source matched | Sourced specifications | Missing/incomplete fields |
| --- | --- | --- | ---: | --- |
| kur-036-women-s-wine-purple-embroidered-kurta-set-with-dupatta | KUR_036 | Yes | 4 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-054-red-embroidered-kurta-with-pants | HIDI_054 | Yes | 3 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-023-royal-blue-embroidered-kurta-set-with-dupatta | HIDI_023 | Yes | 4 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-019-fuchsia-pink-floral-printed-kurta-set-with-pants | HIDI_019 | Yes | 6 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-009-black-embroidered-kurta-set-with-dupatta | HIDI_009 | Yes | 3 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| kur-021-women-s-sage-green-printed-anarkali-kurta-set-with-dupatta | KUR_021 | Yes | 4 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| kur-008-women-s-light-orchid-pink-floral-embroidered-kurta-set-with-dupatta | KUR_008 | Yes | 3 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-060-purple-embroidered-kurta-set-with-dupatta | HIDI_060 | Yes | 4 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-059-red-white-embroidered-kurta-set-with-dupatta | HIDI_059 | Yes | 4 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-058-pink-embroidered-kurta-set-with-dupatta | HIDI_058 | Yes | 5 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-057-brown-floral-embroidered-kurta-set-with-dupatta | HIDI_057 | Yes | 5 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-056-white-purple-embroidered-kurta-set-with-dupatta | HIDI_056 | Yes | 5 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-055-pink-flair-waistcoat-set | HIDI_055 | Yes | 1 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-045-magenta-floral-embroidered-anarkali-suit-set-with-dupatta | HIDI_045 | Yes | 4 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-044-ivory-floral-embroidered-kurta-set-with-dupatta | HIDI_044 | Yes | 4 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-043-dusty-pink-embroidered-kurta-set-with-dupatta | HIDI_043 | Yes | 3 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-041-lavender-kurta-set-with-printed-dupatta | HIDI_041 | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-031-wine-purple-embroidered-kurta-set-with-dupatta | HIDI_031 | Yes | 5 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-027-chocolate-brown-floral-embroidered-kurta-set-with-dupatta | HIDI_027 | Yes | 5 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-018-olive-green-floral-embroidered-kurta-set-with-dupatta | HIDI_018 | Yes | 5 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-039-rust-orange-embroidered-kurta-set-with-dupatta | HIDI_039 | Yes | 4 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-038-baby-pink-embroidered-anarkali-suit-set-with-dupatta | HIDI_038 | Yes | 5 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-015-olive-green-floral-embroidered-anarkali-suit-set-with-dupatta | HIDI_015 | Yes | 4 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-011-chocolate-brown-printed-kurta-set-with-dupatta | HIDI_011 | Yes | 4 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-007-teal-blue-embroidered-kurta-set-with-dupatta | HIDI_007 | Yes | 4 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-006-lilac-pink-floral-embroidered-kurta-set-with-dupatta | HIDI_006 | Yes | 4 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| hidi-005-pista-green-embroidered-kurta-set-with-dupatta | HIDI_005 | Yes | 3 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| pink-floral-printed-kurta-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| olive-green-swan-floral-printed-shirt-style-kurta-set | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| yellow-floral-printed-anarkali-kurta-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| rust-orange-embroidered-kurta-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| white-printed-sleeveless-kurti-with-palazzo-set | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| cream-embroidered-kurta-pant-set | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| olive-green-embroidered-anarkali-kurta-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| lavender-embroidered-kurta-set-with-pants | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| grey-printed-sleeveless-kurti-with-palazzo-set | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| pink-designer-embroidered-suit-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| pastel-yellow-handwork-kurta-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| golden-yellow-designer-embroidered-kurta-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| cream-floral-embroidered-kurta-pant-set | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| orange-embroidered-cotton-coord-set | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| cream-floral-printed-kurta-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| navy-blue-embroidered-kurta-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| black-floral-embroidered-anarkali-suit-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| cream-floral-embroidered-kurta-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| aashi-sky-blue-floral-kurta-set | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| roshni-magenta-floral-anarkali-set | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| nila-navy-floral-kurta-set | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| avni-off-white-embroidered-kurta-set | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| kiara-coral-pink-anarkali-set | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| women-s-chocolate-brown-printed-kurta-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| women-s-black-embroidered-kurta-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| women-s-red-multicolour-floral-printed-kurta-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |
| women-s-cream-floral-embroidered-kurta-set-with-dupatta | Not identifiable | No | 0 | Bust, Waist, Hip, Shoulder, Sleeve length, Garment length, model height and worn size, lining confirmation, pocket confirmation, waistband confirmation, fibre composition percentages |

## Sources and scope

- Original workbook: Excel GK 1 (8).xlsx; SHA-256 d54cc2fd8cd83c82c70a46b2b706d924e88c31c70c5d24c88c93b091a7ea55d2.
- Published catalogue and individual product detail GET responses captured locally on 20 October 2026.
- Source index used only to locate original workbook row ranges and style codes; values were read from the original workbook XML.
- No workbook, database, live catalogue, shared loading script, SEO metadata or deployment files were changed. No deployment performed.
- This audit does not claim that unknown lining, pockets or waistband are absent. Those fields require confirmation.

## Verification

- Production build and TypeScript passed.
- All 16 source-data, product-copy and sharing tests passed.
- Existing five-width browser suite passed: gallery, size guide, selection, mocked cart and delivery.
- Actual-photo desktop and mobile previews checked the new source specifications and missing-measurement note.
- Full audit data stays on the server; only the current product's display labels and values are sent to client components.
