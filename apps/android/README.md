# HIDI Android

Thin Android shell for the existing HIDI mobile storefront.

## Current build

- Package: `com.thehidi.app`
- Version: `1.0.0`
- Minimum Android: 8.0 (API 26)
- Target SDK: 35
- Default storefront: `https://thidigk.thehidi.com/`
- Production domain deep links: `https://thehidi.com/`

The default URL can be overridden at build time:

```bash
gradle -p apps/android -PHIDI_START_URL=https://thehidi.com/ :app:assembleRelease
```

The current release variant is intentionally signed with the standard Android debug key so the CI artifact is directly installable for testing. Before Play Store publishing, switch to Play App Signing or a protected long-term release keystore.
