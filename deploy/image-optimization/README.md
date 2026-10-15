# HIDI photo upload candidate — 15 October 2026

**Draft PR #72. Source changes only; not deployed.**

The candidate removes the fixed 12/40 MiB product-photo file limits across individual SKU, Image-SKU, SKN photo matching, and Product Upload entry points. Existing ZIP-package/batch limits remain separate. No storage system is physically unlimited: disk reserve, timeouts, file format, pixel count and hosting ingress limits remain relevant.

Large uploads are streamed to private temporary files, hashed incrementally, validated, then uploaded using Azure SDK staged blocks. Browser hashing is also incremental and is bundled for raw admin-module delivery. Original bytes are preserved; customer-facing variants are resized separately. Request cancellation and disk exhaustion clean up temporary files. Admin identity and permitted role are checked with the backend before reading the upload body, then rechecked by upload-ticket authorization. Customer requests, payments and catalogue records are not modified by testing.

`AdminMediaUploadTicket.maxBytes` changes from Int to BigInt. Its additive migration file is prepared but **has not been applied to Azure SQL**. Rollout requires a reviewed matching web/API/container-wrapper release and database migration plan; old pinned overlay release scripts must not be run against an unknown live baseline.

Retained protections: still JPEG/PNG/WebP/AVIF; 100 megapixel decoder guard; available-disk reserve; per-process upload slot; bounded field counts; timeouts; separate ZIP/package expansion and batch-size safeguards. The old buffered `readPhotoForm` helper retains its historical 40 MiB guard solely for compatibility tests; production candidate routing uses `readStreamedPhotoForm` instead.

## Validation and evidence

`full-regression.py` runs all repository root Node unit fixture files, API TypeScript fixtures, deploy-module tests, Python release guard fixtures, both application builds, ESLint, and supported localhost browser suites. Tests are not deleted or skipped to create a green release gate. Independent failures are retained in `reports/image-complete/results.json`, `cases.csv`, `SUMMARY.md` and full logs, with browser screenshots under `test-results`.

Streaming boundary fixtures include 12/40/40+1/60/100 MiB. These use a valid JPEG plus trailing padding to verify byte handling. `genuine-large-photo.mjs` separately creates a genuine 36 MP random PNG over 100 MiB, with no trailing padding, exercises streamed multipart ingestion and resizing, and checks source hashes. Both are synthetic—not real garment visual approval or production speed benchmarks.

Actual Azure authenticated large upload, deployment-specific memory/disk/timeout behaviour, database migration execution, retained-container-only browser suites, and real HIDI fabric/colour/zoom approval are not established by these fixtures. They remain explicit release gates. The PR remains a draft until fresh complete evidence supports rollout.
