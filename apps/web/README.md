# HIDI — immersive video hero and transparent navigation

React.js with JavaScript/JSX and CSS. This update starts from
HIDI-Landing-Page-React-No-Stretch.zip and changes the landing-page header and hero.

## Run the editable React project

Extract into a NEW empty folder. Open HIDI-Landing-Page-React in VS Code.
Use Node.js 22.12 or newer, then run:

```sh
npm install
npm run dev
```

Open the **Local address printed in the terminal**. Vite prefers port 5188 and
selects a later available port when necessary. Do not reopen a different, older
HIDI server. START-HIDI-REACT.bat runs the same project on Windows.

For the usual production build:

```sh
npm run build
npm run preview
```

## Preview without installing packages

```sh
node scripts/preview.mjs
```

PREVIEW-HIDI.bat is the equivalent Windows launcher. This server tries 4188 and
falls forward to another available local port. It serves the included compiled
React snapshot; it is not a source watcher. Use npm run dev while editing JSX.

## Header and hero behavior

- The announcement strip is no longer rendered.
- The actual HIDI feather-and-wordmark logo is centered in a balanced header.
- The header overlays the full-height video with a transparent background at
  the top. It fades to the existing burgundy after scrolling approximately 48px,
  stays burgundy while scrolling back upward, and becomes transparent within
  16px of the top. Its position and height do not jump during that change.
- Contact, bag, account, search and menu replace the previous exposed links and
  sign-in/signup/app buttons. On mobile the icons are balanced on both sides of
  the centered logo. Contact and app access are available in the menu.
- The visible headline, paragraph and previous hero actions are removed. One
  white Shop Now button sits horizontally centered near the lower hero, with a
  discreet pause/play control at the lower right.
- The supplied desktop and mobile clips have a moderate shadow/exposure lift,
  controlled contrast and slightly richer color. Matching first-frame posters
  prevent a different photograph flashing before playback. Video is silent.
- Reduced-motion and data-saving preferences remain respected. The photograph
  remains available when video cannot autoplay.

## Interaction and integration status

Shop Now invokes the previous signup flow. Account opens sign-in. Existing
configured URLs in public/config.js are preserved. When no URLs are supplied,
these remain explicitly labelled design previews; no account is created.

The search drawer filters the five existing collection names/descriptions locally;
it is not a product-search backend. The bag action explains that cart/checkout
are not connected. The menu links to the actual sections and existing account,
app and contact flows. App, newsletter and policy integrations remain unchanged.

## Preserved from the input

Rolling carousel code, photographs and titles; static Meet HIDI photograph;
Golden Hour lettering and square image corners; brand promises; footer and its
pattern; full-logo favicons; automatic port fallback; and the no-stretch behavior.
No GitHub, live website or browser-profile data was changed.

## Checks and limitations

```sh
npm test
npm run check
```

See QUALITY-CHECKS.md and validation/ for the checks actually performed. An
independently rebuilt compiled React snapshot is included. The standard npm/Vite
build was not executable in the packaging environment: package downloads were
unavailable and the local dependency cache was incomplete. Test npm run build
in your own development environment before production deployment.

This ZIP contains no node_modules, Vite cache, dist folder, temporary screenshots,
logs or superseded compiled bundles. Favicon aliases are intentional compatibility
files. The cleanup script does not erase browser history or stop other servers.
