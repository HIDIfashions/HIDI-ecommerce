import type { Metadata } from "next";
import "./globals.css";
import "./hotfix.css";
import "./launch-overrides.css";
import "./typography.css";
import "./storefront-surfaces.css";
import "./editorial-chrome.css";
import "./storefront-quality.css";
import { Suspense } from "react";
import { AnalyticsTags } from "@/components/analytics-tags";
import { SiteShell } from "@/components/site-shell";
import { absoluteUrl, getSiteUrl, safeJsonLd } from "@/lib/site-url";
import { isSearchIndexingEnabled } from "@/lib/seo";
export const dynamic = "force-dynamic";
const site = getSiteUrl();
const defaultTitle = "HIDI — Kurta Sets & Indian Wear for Women";
const defaultDescription = "Explore HIDI women's kurta sets and Indian wear for work, everyday dressing and occasions. Discover the latest styles, colours and sizes.";
const socialProfiles = [process.env.NEXT_PUBLIC_HIDI_INSTAGRAM_URL, process.env.NEXT_PUBLIC_HIDI_FACEBOOK_URL, process.env.NEXT_PUBLIC_HIDI_X_URL, process.env.NEXT_PUBLIC_HIDI_YOUTUBE_URL].filter((value): value is string => Boolean(value?.trim()));
const googleVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim() || process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
function gaMeasurementId() {
  const value = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim();
  return value && /^G-[A-Z0-9]+$/i.test(value) ? value.toUpperCase() : undefined;
}
function metaPixelId() {
  const value = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID?.trim();
  return value && /^\d{6,32}$/.test(value) ? value : undefined;
}
export function generateMetadata(): Metadata {
  const index = isSearchIndexingEnabled();
  return { metadataBase: site, applicationName: "HIDI", title: { default: defaultTitle, template: "%s | HIDI" }, description: defaultDescription,
    openGraph: { type: "website", locale: "en_IN", siteName: "HIDI", url: "/", title: defaultTitle, description: defaultDescription, images: [{ url: "/brand/hidi-hero-green-garden-fullbody.webp", width: 1672, height: 941, alt: "HIDI Indian wear editorial" }] },
    twitter: { card: "summary_large_image", title: defaultTitle, description: defaultDescription, images: ["/brand/hidi-hero-green-garden-fullbody.webp"] },
    verification: googleVerification ? { google: googleVerification } : undefined,
    robots: { index, follow: index, googleBot: { index, follow: index, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  };
}
const organizationJsonLd = { "@context": "https://schema.org", "@type": "Organization", "@id": absoluteUrl("/#organization"), name: "HIDI", url: absoluteUrl("/"), logo: absoluteUrl("/brand/hidi-logo-header.svg"), ...(socialProfiles.length ? { sameAs: socialProfiles } : {}) };
const websiteJsonLd = { "@context": "https://schema.org", "@type": "WebSite", "@id": absoluteUrl("/#website"), name: "HIDI", url: absoluteUrl("/"), publisher: { "@id": absoluteUrl("/#organization") } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const analyticsEnabled = isSearchIndexingEnabled();
  return <html lang="en-IN" suppressHydrationWarning><body suppressHydrationWarning><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd([organizationJsonLd, websiteJsonLd]) }} />{analyticsEnabled ? <Suspense fallback={null}><AnalyticsTags gaMeasurementId={gaMeasurementId()} metaPixelId={metaPixelId()} /></Suspense> : null}<SiteShell>{children}</SiteShell></body></html>;
}
