# Persistent product-image derivatives

This migration keeps the immutable original product photograph in the existing Azure `product-media` container and adds shopper-ready WebP derivatives under:

`products/_derivatives/v1/<original-without-extension>/<width>.webp`

Current persisted widths: 384, 640, 750, 828, 1080, 1200 and 1920.

## Safety model

- New Azure uploads generate all common derivatives before image metadata is attached to the SKU.
- The live image handler prefers a persisted derivative, but falls back to the existing Sharp-on-request pipeline when a derivative is absent.
- 2048/3840 zoom requests and non-WebP clients continue to use the existing runtime path.
- Originals are never overwritten.
- Derivative writes use `ifNoneMatch: "*"` and validate source SHA metadata on replay.
- The backfill is dry-run by default. Production writes require both `--apply` and `HIDI_ALLOW_PRODUCTION_IMAGE_BACKFILL=YES`.
- No database migration is required.

## Backfill

Dry run:

`node deploy/image-derivatives/backfill.mjs`

Approved Azure write:

`HIDI_ALLOW_PRODUCTION_IMAGE_BACKFILL=YES AZURE_STORAGE_ACCOUNT=<account> node deploy/image-derivatives/backfill.mjs --apply`

Use `--limit=N` for a small canary.

## Rollout order

1. Unit/build tests.
2. Browser upload/render test against fixtures.
3. Deploy code with runtime fallback intact.
4. Canary one newly uploaded image and verify `X-Hidi-Image-Cache: PERSISTED`.
5. Run limited backfill, inspect.
6. Backfill remaining published Azure images.
7. Keep runtime fallback for 2048/3840 and legacy/non-WebP cases until a later, separately reviewed removal.
