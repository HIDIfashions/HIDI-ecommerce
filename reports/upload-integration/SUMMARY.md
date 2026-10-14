# Latest browser upload and rendering verification

Tested commit: bc52d30357e15dae7f8573b99fbf47e5cf1ca864
Run: 38647870171
Production changes: NONE
Storage: isolated filesystem; actual upload handler and built UI

| Check | Result |
|---|---|
| current-route-and-client | FAIL |
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
- chromium / 45 MiB JPEG plus PNG upload through the real sequential web client: FAIL
