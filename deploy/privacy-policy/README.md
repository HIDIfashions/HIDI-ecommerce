# HIDI privacy policy administration

Owner portal: `/admin/privacy-policy`. Public approved policy: `/privacy`.

- Business name defaults to **High D Higher Dimensions**. Address, officer name/designation, monitored email, telephone and effective date start blank, with editor placeholders.
- Draft includes the reviewed policy structure. Tracking and retention instructions must be replaced with accurate approved disclosures.
- Only the existing authenticated `OWNER` role can read, preview, save or publish the draft. Authentication is verified against the retained `/api/admin/session` endpoint for every operation. No new users or auth settings are created.
- Save draft persists privately. Preview uses saved draft content. Publish requires complete facts, removal of placeholders, a valid effective date and explicit owner approval. Publication is never part of deployment.
- Every published revision has an immutable version blob, approver identifier, timestamp and content hash. Later draft edits leave the public version unchanged. ETag conditions prevent overwriting concurrent edits. A failed concurrent publication may leave an unreferenced private archive; it cannot change the published version.
- State and history are in the **private** Azure container `hidi-private-policies` on the existing storage account, accessed using the existing web managed identity. Media routing cannot serve this container. Public routes return only the approved version or an unavailable message.

## Release and regression

The workflow `privacy-policy-release.yml` runs only with an explicit `[deploy-privacy-admin]` commit marker. It captures fresh ready immutable live images, backs up the web image, composes an additive overlay, compares protected file hashes and image settings, tests the actual module and runtime, verifies container privacy, then updates only the web image. The API, SQL schema/data, auth settings, secrets, media payloads and existing Next build are retained. Failed verification rolls back only an image still owned by this release.

The runtime patch adds five hooks to the exact live server. It refuses unknown or already-patched runtimes. Existing landing and shopping footers receive real `/privacy` links; admin navigation receives a policy link. The editor and policy stylesheet are separate from the existing storefront stylesheet.

Checks cover owner versus staff/anonymous access, CSRF, draft persistence, placeholders, HTML escaping, optimistic concurrency, publication approval, immutable public versions, archive access, browser editor behavior, footer actions, mobile width and 21 existing runtime/media/proxy checks. Browser publication tests use an isolated in-memory fixture and never publish to production.

Future image rebuilds must retain this overlay or integrate its handler and links into the native landing/storefront source. Do not replace the live runtime with an older branch build. For a subsequent code release, review the existing hooks explicitly before changing the patch guard.

G002 remains open until the owner completes and publishes an approved policy and verifies the two public links. Deploying a draft editor does not itself satisfy publication requirements.
