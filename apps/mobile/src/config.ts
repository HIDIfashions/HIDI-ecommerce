export type MobileEnvironment = "staging" | "production";

const requested = String(process.env.HIDI_MOBILE_ENV ?? "").toLowerCase();
export const environment: MobileEnvironment = requested === "production" ? "production" : "staging";
export const publicOrigin = environment === "production" ? "https://thehidi.com" : "https://thidigk.thehidi.com";
export const apiBaseUrl = publicOrigin + "/api/store";
export const supabaseUrl = String(process.env.HIDI_SUPABASE_URL ?? "").trim();
export const supabasePublishableKey = String(process.env.HIDI_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
export const stripePublishableKey = String(process.env.HIDI_STRIPE_PUBLISHABLE_KEY ?? "").trim();
export const appleMerchantId = String(process.env.HIDI_APPLE_MERCHANT_ID ?? "merchant.com.thehidi.app").trim();
const threshold = Number(process.env.HIDI_FREE_SHIPPING_THRESHOLD_PAISE ?? 0);
export const freeShippingThresholdPaise = Number.isSafeInteger(threshold) && threshold > 0 ? threshold : 0;
export const requestTimeoutMs = 15000;

export function mediaUrl(value?: string | null) {
  const source = value?.trim();
  if (!source) return "";
  if (source.startsWith("/")) return publicOrigin + source;
  return source.startsWith("https://") ? source : "";
}

export const brandAssets = {
  logo: publicOrigin + "/assets/images/hidi-logo.png",
  hero: publicOrigin + "/assets/images/hero-mobile-luminous-first-frame-v1.webp",
  cinematic: publicOrigin + "/assets/images/hidi-cinematic-dupatta-model.webp",
  occasion: publicOrigin + "/assets/images/occasion-set.webp",
  portrait: publicOrigin + "/assets/images/hero-portrait.webp",
  banner: publicOrigin + "/assets/images/hidi-premium-ai-full-banner-lossless.png",
} as const;
