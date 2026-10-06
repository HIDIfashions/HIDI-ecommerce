module.exports = {
  presets: [
    ["module:@react-native/babel-preset", { jsxImportSource: "nativewind" }],
    "nativewind/babel",
  ],
  plugins: [
    ["transform-inline-environment-variables", {
      include: [
        "HIDI_MOBILE_ENV",
        "HIDI_SUPABASE_URL",
        "HIDI_SUPABASE_PUBLISHABLE_KEY",
        "HIDI_STRIPE_PUBLISHABLE_KEY",
        "HIDI_APPLE_MERCHANT_ID",
        "HIDI_FREE_SHIPPING_THRESHOLD_PAISE"
      ],
    }],
    "react-native-worklets/plugin",
  ],
};
