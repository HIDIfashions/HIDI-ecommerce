# HIDI image optimization candidate — 15 October 2026

Status: isolated candidate, not a production deployment. Branch: `work/image-optimization-20261015`. Pinned source: `586efc65657a0070475ac0e47e1fb29e79d8a821`.

## Implemented

- Raise only product-photo validators to 40 MiB (41,943,040 bytes), with a 42 MiB multipart envelope. The Next proxy buffer is global; endpoint-specific payment, document, ZIP and video limits are not changed.
- Serialize large multipart photo uploads per web process, enforce actual streamed request bytes, require one file, and release the upload slot after success or failure. Keep existing admin authentication, upload authorization, Image SKU matching, metadata writes and ambiguous-failure retry precautions.
- Resize customer-facing images to approved widths, preserve aspect ratio, orient photos correctly, convert display output to sRGB, and retain alpha in WebP. JPEG is the fallback. No AI editing, crop, retouching, upscaling or replacement of original Blob objects.
- Generate/cache a 1920px WebP display master; generate the larger 3840px master only for requests exceeding 1920px. This is request-driven: browser gallery behavior still needs a live network check.
- Cap source size at 40 MiB and input at 100 megapixels. Keep a 30-second decoder timeout, bounded queue and 256 MiB local disk cache. Fetch large originals inside the serial decode queue, including zoom requests.
- Retain the specific browser-readable truncated-JPEG recovery introduced earlier. Unrelated corruption still fails; failures never return the oversized original as a thumbnail.
- Version cache keys and add the existing `hidi_image=3` URL hint without changing the established display route prefix. Preserve GET, HEAD, conditional ETag/304, content-type and format negotiation semantics.

Supported upload MIME types remain JPEG, PNG, WebP and AVIF. This does not add PSD, TIFF, RAW, GIF or video support. Animated/multi-page product images are rejected by the optimizer. Large source uploads can still be slow on the uploader's connection.

## Evidence actually obtained locally

44 image, HTTP, cache, multipart and regression tests passed using Node 22.16.0 / Sharp 0.34.1. A deterministic 6000 × 4000 JPEG of 31,798,076 bytes was processed successfully with the original SHA-256 unchanged.

| Requested width | Output dimensions | WebP bytes |
|---|---|---:|
| 384 | 384 × 256 | 1,924 |
| 640 | 640 × 427 | 17,384 |
| 1080 | 1080 × 720 | 109,270 |
| 1920 | 1920 × 1280 | 685,038 |
| 2048 | 2048 × 1365 | 785,728 |

These are **synthetic noise stress-test measurements**, not HIDI garment-photo measurements or live website speed results. Noise downsampling produces unusually small low-resolution outputs. Do not use these numbers to promise compression ratios for catalogue photography.

A valid JPEG padded to exactly 40 MiB also passed the byte-boundary processing and multipart checks; a 40 MiB + 1 byte upload was rejected. Padding was used only for the exact-limit test, not the 31.8 MB image above.

## Source integration and isolated CI

`prepare-source.py --apply` checks pinned Git blob hashes and exact anchors before changing any file. It connects the new multipart handler and synchronizes SKU/bulk/API limits and labels. It refuses changed/concurrent source rather than overwriting it, and is safe to rerun.

The branch-only candidate workflow applies that deterministic patch, runs the image tests, existing JPEG recovery tests, syntax/contract checks and large-image test, then records the prepared source changes **only on the isolated branch**. It contains no Azure login, cloud secrets, production traffic switch, SQL migration, Blob catalogue rewrite, merge or force push.

Syntax/transpilation checks are not a full Next/Nest typecheck. Passing this workflow is not approval to deploy.

## Remaining release gates

1. Confirm the current live image handler and web/API container digests; source and live overlays may differ. Do not run old release scripts with their obsolete pinned baselines.
2. Build and typecheck the complete application and run existing product, inventory, login, cart, checkout and offer regression checks. Review any old tests with 12 MiB expectations explicitly.
3. Assemble the new handler at the live wrapper's `product-images/images.mjs` path and build the matching web/API candidate. Preserve unrelated overlays and prepare a verified rollback.
4. Test an authenticated real 30–40 MB upload on an isolated product, SKU and Image-SKU bulk flows, slow uploads, duplicate/failed requests, and multiple admin sessions. Check actual Azure memory, proxy and timeout limits. A per-process limiter is not a distributed upload queue.
5. Compare light/dark real garment photos and embroidery at normal view and zoom, in mobile and desktop browsers. Check correct `sizes`, lazy/eager behavior, zoom-only network loading, first-visit cold cache and repeated cached delivery. This candidate does not change gallery markup or hero/video behavior.
6. Obtain approval of staging results, deploy the matched web/API/handler safely, and verify production network sizes, cache headers and storefront regressions before claiming live 40 MiB support.

Original files and current live settings have not been changed during local validation.
