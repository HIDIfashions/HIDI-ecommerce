# Admin typography

Owner portal: `/admin/typography`. Save a draft, then publish it to the storefront
or admin profile. Restoring the previous publication creates a new revision.
Installation preserves the existing font styles until the owner first publishes.

Both profiles share 12 choices: System sans, Inter, Lora, Manrope, Playfair
Display, Cormorant Garamond, Libre Baskerville, Poppins, Montserrat, DM Sans,
Nunito Sans and Source Sans 3. WOFF2 files and their OFL licenses are bundled
under `fonts/`; no visitor contacts a third-party font service. Poppins supplies
nine static weights; the other installed families use variable fonts. Versions,
package integrity and file checksums are recorded in the manifest. Font IDs are
validated against the registry. Headings,
body copy, product names and controls have independent roles. Published CSS sets
`--font-sans`, `--font-body`, `--font-display`, `--font-product`, and `--font-ui`.
Screen-only family rules cover legacy module styles; sizes, spacing, colours,
printed labels, and SVG artwork are retained.

The same stylesheet is injected into the landing HTML, streamed shopping HTML,
and early admin HTML handlers. This is present before client JavaScript runs.
The root scope is set server-side and updated on client navigation. An open page
checks the published revision every 30 seconds and on focus/visibility recovery.
Publications using added fonts include their required font faces, so open tabs
with the original cached font catalogue can load the new choice without a reload.
It replaces its stylesheet only after the new sheet loads; input state and the
document stay intact. A failed update retains the existing sheet. The backend
can serve its last valid in-memory publication during a transient storage error;
a cold process with unavailable storage fails the CSS request, leaving original
site styles as the fallback. Font download failure uses the declared system stack.

Backend state uses the dedicated **private** Azure container
`hidi-private-typography`, accessed by the existing web managed identity. Every
owner read/write verifies the retained staff session. Same-origin JSON writes
are bounded to 8 KiB. Azure ETags protect against concurrent writes, including
multiple web replicas. A publication is archived with actor and timestamp before
the atomic state update. A lost CAS race can leave an unreferenced private
archive, but cannot change published fonts. Public JSON/CSS excludes drafts and
audit data. No public asset route exposes storage or server code.

The guarded release captures and backs up the fresh immutable production web
image, adds only the registered typography assets and reversible runtime/nav
hooks, verifies all retained bytes, and runs the candidate through Chromium,
Firefox and WebKit at phone/tablet/desktop widths. The API image, SQL database,
commerce data, original client bundles and image settings stay intact. Deploy
only the sealed tested digest; live regressions trigger owned rollback.
An upgrade verifies the installed runtime hooks without adding them twice,
protects original font binaries, and compares the published settings and CSS
before and after deployment. It does not save or publish any production settings.
Automatic rollback is withheld if an owner independently changes typography
during the rollout, because the previous image may not support that selection.

Tests: `node deploy/typography/unit.mjs` and
`HIDI_PLAYWRIGHT_MODULE=<playwright/index.mjs> node deploy/typography/verify.mjs`.
Set `HIDI_CANDIDATE_RUNTIME` to the extracted candidate for retained-runtime
integration. Candidate tests mock external identity/storage/catalogue services,
exercise the actual handler and UI, and block production commerce writes.
The added-font matrix publishes all eight families in both profiles on all three
engines, loads real font weights, checks profile isolation, and exercises tabs
using the pre-upgrade font catalogue. It also checks persistence after reload.
`--live` verifies public assets, route coverage, auth denial and responsive UI
without publishing a font configuration.

Future full image rebuilds must retain this overlay or integrate these same
handler and delivery hooks into the replacement runtime.
