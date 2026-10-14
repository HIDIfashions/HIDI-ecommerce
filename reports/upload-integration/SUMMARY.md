# Latest browser upload and rendering verification

Tested commit: 371a1f3d10fb02f7aea7198a4673e9755444a071
Run: 38649687988
Production changes: NONE
Storage: isolated filesystem; actual upload handler and built UI

| Check | Result |
|---|---|
| current-route-and-client | PASS |
| prisma-generate | PASS |
| api-build | PASS |
| api-regression | PASS |
| web-build | PASS |
| browser-photo-digest | PASS |
| web-upload-and-rendering | FAIL |

## Browser cases
- chromium / Standalone admin SHA-256 without whole-file arrayBuffer: PASS
- firefox / Standalone admin SHA-256 without whole-file arrayBuffer: PASS
- webkit / Standalone admin SHA-256 without whole-file arrayBuffer: PASS
- chromium / Real product-editor screen loads with isolated stock and prices: PASS
- chromium / 45 MiB JPEG plus PNG upload through the real sequential web client: PASS
- chromium / The original large upload is byte-for-byte unchanged: PASS
- chromium / Uploaded photos render in the production-built product page as optimized images: PASS
- chromium / Desktop and mobile product rendering has no horizontal page overflow: PASS
- chromium / Uploaded photo opens in zoom and Escape returns to the product page: PASS
- chromium / Missing and expired admin sessions cannot read or store photo uploads: PASS
- chromium / Corrupted upload shows an error without attaching a photo: FAIL
- firefox / Real product-editor screen loads with isolated stock and prices: PASS
- firefox / 45 MiB JPEG plus PNG upload through the real sequential web client: PASS
- firefox / The original large upload is byte-for-byte unchanged: PASS
- firefox / Uploaded photos render in the production-built product page as optimized images: PASS
- firefox / Desktop and mobile product rendering has no horizontal page overflow: PASS
- firefox / Uploaded photo opens in zoom and Escape returns to the product page: PASS
- firefox / Missing and expired admin sessions cannot read or store photo uploads: PASS
- firefox / Corrupted upload shows an error without attaching a photo: FAIL
- webkit / Real product-editor screen loads with isolated stock and prices: PASS
- webkit / 45 MiB JPEG plus PNG upload through the real sequential web client: PASS
- webkit / The original large upload is byte-for-byte unchanged: PASS
- webkit / Uploaded photos render in the production-built product page as optimized images: PASS
- webkit / Desktop and mobile product rendering has no horizontal page overflow: PASS
- webkit / Uploaded photo opens in zoom and Escape returns to the product page: PASS
- webkit / Missing and expired admin sessions cannot read or store photo uploads: PASS
- webkit / Corrupted upload shows an error without attaching a photo: FAIL

## Not executed
- Real Azure storage and deployed ingress verification
- SQL migration execution and production deployment
- Real garment colour and embroidery approval
- The separately prepared compiled-route HTTP probe was not executed in this suite
