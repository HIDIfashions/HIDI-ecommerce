# Homepage video and optional image uploads

Adds separate **Upload video** and **Upload image** controls to Admin → Landing Media → Homepage hero media. Uploads use the existing authenticated streaming media handler and remain in the library/draft until **Publish banner** is selected. The hero always publishes with automatic rotation enabled; Ananya retains its existing autoplay preference.

With a video and image selected, the retained carousel plays the video to completion, displays each image for the selected duration, and repeats on desktop and mobile. Removing images from the draft and publishing restores video-only looping. A newly uploaded image defaults to **Full image - no crop**; owners can select the existing fill/crop treatment instead. Desktop/mobile focal points and existing sequence controls remain available. Reduced-motion preferences, pause/manual navigation, video audio controls, and video playback logic are retained.

The bounded runtime patch changes only the admin HTML, the homepage HTML's module reference/image-only style, and the versioned homepage module's image-fit projection/rendering. Exact anchors and inverse transforms verify that unrelated bytes are preserved. It does not change the media handler, storage schema, product data, checkout, prices, payments, or offers.

## Local preview and checks

The output at `outputs/hero-image-loop-preview` has a retained release admin/media-handler baseline and a captured public homepage module. The review uses the actual retained handler with an in-memory storage fixture. Uploaded files and publication are local only; no production writes are allowed. Commerce writes are blocked and performance beacons are discarded locally.

From this repository, after preparing the baseline:

```powershell
node deploy/hero-image-loop/prepare.mjs ../outputs/hero-image-loop-preview
python deploy/hero-image-loop/patch-runtime.py ../outputs/hero-image-loop-preview/baseline ../outputs/hero-image-loop-preview/candidate
node deploy/hero-image-loop/regression.mjs ../outputs/hero-image-loop-preview
node deploy/hero-image-loop/preview.mjs ../outputs/hero-image-loop-preview 4326
```

Open `http://127.0.0.1:4326/review`. It creates only a local fixture session. The preview begins with the existing video and no image. Upload any supported image, publish locally, and open the storefront preview link. Restarting the server resets all fixture data.

Regression coverage: real image/video file picker uploads; draft isolation; publish/reload persistence; upload and publication failures with retry; unsupported uploads; unauthenticated requests; natural video → image → video playback on desktop/mobile; native video-only looping after image removal; full-image preview/display; retained other-section controls; storage-write boundaries; browser errors and horizontal overflow. Evidence is in `results/regression.json` and the adjacent screenshots. These are isolated Chromium checks, not a production deployment or cross-browser certification.

## Release status

Production deployment is performed by `hero-image-loop-release.yml`, using `release.py` to capture the current immutable runtime, preserve rollback images, compose only the three allowed files, run all gates, and conditionally update only the web image. The previously reviewed local baseline is not used for deployment. Pricing, payment and offer assets, API image, application settings and public configuration must remain unchanged. No artwork is uploaded or published by deployment.

The release runs the existing coupon, WELCOME250, GET1 and purchase regression suites plus hero upload/playback checks on Chromium, Firefox and WebKit at mobile and desktop sizes. Hero uploads/publications run against the extracted production handler with an in-memory blob fixture. Synthetic video/image files exist only in that fixture. Live checks are read-only and verify native video-only playback when the current selection contains one video. Failures after an owned rollout invoke the existing ownership-aware recovery guard. Evidence is retained by the workflow; a successful `after.json` is the deployment receipt.
