# Latest browser upload and rendering verification

Tested commit: 0a81c5dc4b67bcf5fb7263b788a97a5930eebfe0
Run: 38648583910
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
- chromium / Corrupted upload shows an error without attaching a photo: FAIL
