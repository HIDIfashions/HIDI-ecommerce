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
