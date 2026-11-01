# Separate mobile and desktop hero artwork

Reviewed responsive artwork controls. The guarded release deploys code only; it never uploads or publishes artwork.

Select an image in Landing Media → Homepage hero media. The Desktop & mobile images panel lets the owner replace its desktop image, upload a mobile image, or remove the mobile override. Both files belong to one slide, share its ordering, timing and image treatment, and remain draft changes until Publish banner. The previews show the corresponding file. Existing images and all videos retain their current behavior.

Recommend landscape desktop artwork (1920 × 1080) and portrait mobile artwork (1080 × 1920). The current wide artwork will still have space around it on a tall mobile screen until a suitable portrait file is uploaded. Cropping a wide offer graphic to fill a phone can cut off its text; the default full-image treatment remains available.

The existing hero upload endpoint stores both files. Publication accepts an optional `mobileAssetId` for image slides and resolves its URL from the authenticated hero library. Client-supplied mobile URLs are ignored. Mobile video variants and variants in other landing sections are rejected. Public image items include `mobileAssetId`, `mobileUrl`, and `mobileOriginalName` only when configured. Omitting the variant preserves the legacy response shape. Restore retains paired artwork.

The homepage uses a picture source at max-width 700px, updates when the viewport changes, and falls back to desktop artwork if the mobile image fails. The existing React image readiness, carousel and video rendering remain in control. Video-first server bootstraps preserve variants for later image slides; legacy bootstrap output is byte-identical.

The bounded runtime patch changes five files: hero-media.mjs, the admin HTML, the homepage HTML module reference, a new versioned homepage module, and paint-performance/hero.mjs. Anchor counts and inverse transforms guard unrelated source bytes. Apply it to a freshly captured runtime before any release; the local review baseline contains public HTML and is not a deployable production image.

## Local preview

```
python deploy/responsive-hero/patch-runtime.py ../outputs/responsive-hero-preview/baseline ../outputs/responsive-hero-preview/candidate
node deploy/responsive-hero/preview.mjs ../outputs/responsive-hero-preview 4329
```

Open http://127.0.0.1:4329/review. Uploads/publication use the actual patched handler with local in-memory storage. Commerce and unrelated mutations are blocked. Restart resets the local changes.

## Checks

`regression.mjs` covers paired uploads, draft isolation, server validation, ignored untrusted URLs, publish/reload, 700/701px switching, mobile image failure, desktop replacement, removal/restore, upload failures and invalid files. `legacy-check.mjs` verifies unchanged server bootstrap output plus the existing video→image→video and video-only playback suite. Test PNGs are synthetic fixtures, not proposed promotional artwork.

The approved deployment uses responsive-hero-release.yml: capture the current immutable runtime and rollback images, apply only the five permitted files, test Chromium/Firefox/WebKit and retained checkout flows, then conditionally update the web image. It verifies live artwork, fonts, catalogue prices, payments, offers and the API image remain unchanged. An owned failure uses the existing guarded rollback path. Do not reuse downloaded public preview HTML as a release image.
