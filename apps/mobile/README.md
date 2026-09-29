# HIDI Mobile

From-scratch React Native frontend for HIDI.

## Native projects
- Android: `android/`
- iOS: `ios/`
- Android application ID: `com.thehidi.app`
- iOS bundle ID: `com.thehidi.app`

## Run
```bash
cd apps/mobile
npm install
npm start
npm run android

# macOS only
cd ios && pod install && cd ..
npm run ios
```

## Gateway
Debug/staging: `https://thidigk.thehidi.com/api/store`

Production: `https://thehidi.com/api/store`

This branch is frontend-only. It does not create or replace backend/APIM resources.

## Phone sign-in
HIDI requests phone OTP delivery through WhatsApp using the existing Supabase Auth phone flow. Live delivery requires the Supabase project to use Twilio/Twilio Verify with an approved WhatsApp sender. Provider credentials must never be embedded in the app.
