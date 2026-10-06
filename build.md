# HIDI Mobile Premium V2 — build

Branch: `hidi-mobile-premium-v2`
App path: `apps/mobile`
Stack: React Native 0.87.1, React 19.2.3, TypeScript 6, NativeWind 4.2.7, Reanimated 4.7.1, Gesture Handler 3.3, Bottom Sheet 5.2.14, FlashList 2.3.3 and Stripe React Native 0.80.

## Local commands
```bash
cd apps/mobile
npm install
npm run typecheck
npm test -- --runInBand
npm run android
```

## CI
Workflow: `.github/workflows/mobile-premium-v2.yml`
- TypeScript and unit regressions
- Android minified release build
- Ephemeral internal signing, APK verification and ZIP alignment
- iOS Release simulator build

## Runtime configuration
- `HIDI_MOBILE_ENV=staging|production`
- `HIDI_SUPABASE_URL`
- `HIDI_SUPABASE_PUBLISHABLE_KEY`
- `HIDI_STRIPE_PUBLISHABLE_KEY`
- `HIDI_APPLE_MERCHANT_ID`
- `HIDI_FREE_SHIPPING_THRESHOLD_PAISE`

The downloadable CI APK defaults to staging and `com.thehidi.premium.internal`. OTP and payments remain visibly gated when their approved build configuration/server contracts are absent.
