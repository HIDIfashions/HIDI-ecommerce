# Footer app-button verification

## Completed for this update

- `npm test`: passed the existing rolling-motion, occupied-port fallback, asset/import, static-story-photo, favicon and header source checks.
- Compiled React snapshot: regenerated all 28 source modules with the existing React 18.2 / React DOM / Scheduler runtime; JavaScript syntax checked with Node.
- Latest source includes the earlier glass Shop Now button and removes the hero Contact Us and corner playback controls; the snapshot now matches that source.
- Footer tested in a local, in-memory Chromium renderer at 320, 390, 768, 1024, 1440 and 1920 pixels. Local images were injected as data URLs in the test harness because URL navigation is restricted in this environment. Those test-only substitutions are NOT in the shipped source or snapshot.
- Verified a single prominent Get the App button, both store icons, minimum 48px button height and no horizontal overflow at these widths.
- Verified pointer and Enter-key activation open the existing app-options dialog; Escape closes it and returns focus to the footer button.
- App options continue to show the existing unconfigured-store message. No download URL or app availability has been invented.
- No JavaScript page exceptions occurred in those rendered checks.
- Desktop and mobile footer captures were visually inspected.
- ZIP is checked separately for integrity and excludes dependencies, caches and temporary rendering/test files.

## Scope

Only `src/components/Footer.jsx` and footer-scoped rules appended to `src/styles/styles.css` change the React source. All other components, runtime integration configuration, photos, videos, logos and artwork retain their prior file hashes. The obsolete small footer app link is replaced rather than duplicated.

## Not verified

A standard Vite production build and real iPhone/Safari testing were not run. The npm registry could not be resolved in this environment. Normal source development still uses `npm install` and `npm run dev`. `node scripts/preview.mjs` serves the regenerated compiled snapshot without installing packages.
