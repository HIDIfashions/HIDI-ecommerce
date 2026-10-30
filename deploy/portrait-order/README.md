# Landing Media: portrait order review

Adds a five-dress sequence editor inside the existing Landing Media page. Move up/down updates a local draft; Save order publishes only the sequence. The first/last invalid moves are disabled, focus follows a moved item, Reload saved order checks before discarding edits, and Use original order also requires Save.

The existing photo/story tuples remain intact. A saved permutation changes their order only. Custom uploaded Ananya lists retain priority and disable this editor until the built-in gallery is in use.

## Storage and access

One document: `brand/landing-media/portrait-order.json`, in the existing Azure landing-media container with its existing managed identity. Every save uses a storage ETag condition; concurrent editors cannot silently overwrite each other. Anonymous/staff writes, cross-origin requests, extra fields, duplicates, missing/unknown IDs and oversized payloads are rejected. Public responses expose only the five IDs. Failed order reads preserve the default gallery; failed saves preserve the draft.

Existing hero, landing selections, range captions, product records, offer settings, prices, inventory and payment code are not written by this feature.

## Local preparation and regression

From the repository root:

```powershell
git fetch origin hidi-web-new
python deploy/portrait-order/prepare-preview.py ../outputs/portrait-order-preview
# Set HIDI_PLAYWRIGHT_MODULE to the installed Playwright index.mjs.
node deploy/portrait-order/regression.mjs ../outputs/portrait-order-preview
node deploy/portrait-order/preview-server.mjs ../outputs/portrait-order-preview 4318
```

Open `http://127.0.0.1:4318/review`. Its Save button writes to memory only; restarting resets it. All upstream live requests are public asset reads. The regression harness runs the actual patched hero handler against an isolated Azure Blob protocol fixture, plus the captured public homepage bundle and versioned Landing Media HTML. It covers persistence, concurrent conditional writes, permission checks, failures, custom-gallery priority, captions, images and mobile/desktop browser layouts.

The preparation report records the exact admin/server source revision and the captured homepage bundle. These are local preview checks, not proof of the current production container's private files. Before a later deployment, extract the current immutable web image, run `patch-runtime.py` against it (all anchors must match), rerun the regressions against that candidate and verify that only the declared files differ. Preserve all unrelated live configuration and retain a verified rollback image. This change includes no automatic deployment workflow. The user must review the preview before any rollout.
