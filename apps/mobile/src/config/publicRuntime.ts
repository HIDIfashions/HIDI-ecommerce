export const publicRuntime = {
  supabaseUrl: (process.env.HIDI_SUPABASE_URL ?? "").trim().replace(/\/$/, ""),
  supabasePublishableKey: (process.env.HIDI_SUPABASE_PUBLISHABLE_KEY ?? "").trim(),
  environment: (process.env.HIDI_MOBILE_ENV ?? (__DEV__ ? "staging" : "production")).trim(),
} as const;

export function customerAuthConfigured() {
  return Boolean(publicRuntime.supabaseUrl && publicRuntime.supabasePublishableKey);
}
