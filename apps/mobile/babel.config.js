module.exports = {
  presets: ["module:@react-native/babel-preset"],
  plugins: [
    ["transform-inline-environment-variables", {
      include: [
        "HIDI_SUPABASE_URL",
        "HIDI_SUPABASE_PUBLISHABLE_KEY",
        "HIDI_MOBILE_ENV"
      ],
    }],
  ],
};
