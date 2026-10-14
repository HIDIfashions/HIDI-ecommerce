# HIDI backup, deployment decision and real image delivery

Report date: 15 October 2026 (Asia/Kolkata).
Candidate source: f2f857e517b06a01cbdecf7cbbb5f41783022c1c, draft PR #72.

## Deployment decision

NOT DEPLOYED. No live web/API configuration, traffic, SQL data/schema or Blob product photographs were changed by this work. The requested 12 MB photo restriction is removed in the candidate source, including backend upload-ticket validation, but the live uploader's validation was not changed.

Deployment was conditional on successful checks. Application rollback preservation and SQL recovery verification did not complete. The last complete lint run also has 54 errors and 25 warnings; real Azure ingress/upload/resource validation and the full compiled-route integration remain outstanding. Earlier passing source-handler/browser fixture tests do not establish those deployment-specific checks.

## Backup evidence

Preflight run: https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/38652083481
Rollback-copy attempt: https://github.com/HIDIfashions/HIDI-ecommerce/actions/runs/38652330302

Created and verified source recovery branches:
- backup/image-rollout-api-web-20261015 -> 586efc65657a0070475ac0e47e1fb29e79d8a821
- backup/image-rollout-landing-20261015 -> 5ca7a64578d106c527b6cfb22e3379ca57eb3a71
- backup/image-tested-candidate-20261015 -> f2f857e517b06a01cbdecf7cbbb5f41783022c1c

Captured live Azure revisions and verified their registry digests. At capture, both revisions were Healthy/Running with 100% traffic:
- Web: hidi-web--checkoutoffersweb38616730558a1; sha256:26222c14193437d83d98f705796c17bcf70854dce56cf964e35a4dd5f9833c69
- API: hidi-api--checkoutoffersapi38616730558a1; sha256:d55d57a0834bcdcb83da6c88c9fcc41e7c61a29b841383096ef00e70afd82701

The additional ACR rollback-tag import attempt failed for BOTH applications. The receipt explicitly records verified=false and applicationRollbackPreserved=false. The precise Azure error cause was not exposed by that run's error wrapper. A follow-up workflow update was blocked and did not run. Do not claim that the proposed rollback tags exist or that a complete application backup was verified.

SQL recovery metadata could not be read (the SQL server-list command failed). This does not prove that existing Azure SQL backups are absent. No database copy, restore test or Blob-photo copy was performed.

Artifacts: image-azure-rollback-snapshot (11934972182); hidi-verified-application-backup (11935865617, despite this historical artifact label its CONTENT reports backup failure).

## Actual LIVE image measurements — before deployment

Measured through Chromium, using public GET/HEAD requests only, on the home page, /collections/all and /products/pink-floral-printed-kurta-set-with-dupatta. External analytics and media requests were blocked; this is an image-delivery audit, not a total-page loading benchmark. Measurements below concern visible product images, not all catalogue photos or the entire page.

Mobile viewport: 390x844, device pixel ratio 3. Standard laptop: 1440x900, pixel ratio 1. High-density laptop: 1440x900, pixel ratio 2.

| Device | Location | Observed response-body bytes per image | Requested image width |
|---|---|---|---|
| Mobile | Catalogue cards (four samples) | 23405; 16339; 18908; 25425 | 640 px |
| Mobile | Product page (two visible photos) | 64289; 101197 | 1200 px |
| Standard laptop | Catalogue cards (three samples) | 23345; 16363; 18908 | 640 px |
| Standard laptop | Product page (first visible photo) | 23368 | 640 px |
| High-density laptop | Catalogue cards (three samples) | 54389; 34533; 42586 | 1080 px |
| High-density laptop | Product page (first visible photo) | 64297 | 1200 px |

Rounded decimal KB (1 KB=1000 bytes): mobile cards 16.3–25.4 KB and product-page photos 64.3–101.2 KB; standard laptop cards 16.4–23.3 KB and first product photo 23.4 KB; high-density laptop cards 34.5–54.4 KB and first product photo 64.3 KB. These are measured samples, NOT maximum upload limits, universal delivery budgets or a promise for every new photograph.

Evidence artifact: image-live-delivery-measurements (11935835442), containing IMAGE-SIZES.md, image-delivery-measurements.json and nine screenshots.

## Candidate optimizer applied to two real public originals — NOT deployed output

These are real HIDI catalogue photographs, not the earlier padded/flat-colour fixtures. The transforms were run separately without changing originals or the live service. Both outputs are WebP using the candidate pipeline.

Photo A source: /media/products/variants/cmv508ble011s01z3rygu4as3/1791794828102-2020f682-53ea-42fb-b4d3-fce9959fcbe5.jpg
Original A: 5992621 bytes (5.99 MB).
Photo B source: /media/products/variants/cmv4wyxcn00y001z34f04rcgs/1791789139037-566da7f7-2b55-4839-b482-94949233fce9.jpg
Original B: 5398861 bytes (5.40 MB).

| Requested width | Photo A WebP bytes | Photo B WebP bytes |
|---|---:|---:|
| 384 px | 10612 | 8486 |
| 640 px | 23682 | 16588 |
| 828 px | 33884 | 22872 |
| 1080 px | 50406 | 32664 |
| 1200 px | 58952 | 37754 |
| 1920 px | 132670 | 83312 |
| 3840 px | 488068 | 356886 |

The browser-selected width and each photograph's detail determine its compressed bytes; there is no single guaranteed mobile or laptop file size. A future 30–40 MB original is not automatically delivered at that original size through the optimized storefront path, but these two existing-photo measurements are not a compression guarantee for every future upload. Full-size original/media URLs remain separate from optimized storefront requests.

## Candidate upload validation

Backend createVariantImageUploadTicket checks an allowed still-image MIME type, a positive representable integer size, a valid product variant and deleted-product safeguards. It no longer rejects a file merely for exceeding 12 MB or 40 MiB. The candidate still retains image-decoding, 100 MP, available-disk, timeout/cancellation, concurrency, batch and ZIP safeguards. Its Int-to-BigInt upload-ticket migration is prepared but not applied. Removing the UI text alone is not a completed backend rollout.

## Next release requirements

Complete and verify recoverability, resolve the remaining lint/release findings, validate a matching staged web/API/image-handler package with the real storage/ingress path and database migration, then perform the production switch and remeasure customer image delivery. No production switch is recorded by this report.
