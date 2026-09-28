import type { Metadata } from "next";
import "./globals.css";
import "./hotfix.css";
import "./launch-overrides.css";
import "./typography.css";
import "./storefront-surfaces.css";
import "./editorial-chrome.css";
import { SiteShell } from "@/components/site-shell";
import { absoluteUrl, getSiteUrl, safeJsonLd } from "@/lib/site-url";
import { isSearchIndexingEnabled } from "@/lib/seo";
export const dynamic = "force-dynamic";
const site = getSiteUrl();
const defaultTitle = "HIDI — Kurta Sets & Indian Wear for Women";
const defaultDescription = "Explore HIDI women's kurta sets and Indian wear for work, everyday dressing and occasions. Discover the latest styles, colours and sizes.";
const socialProfiles = [process.env.NEXT_PUBLIC_HIDI_INSTAGRAM_URL, process.env.NEXT_PUBLIC_HIDI_FACEBOOK_URL, process.env.NEXT_PUBLIC_HIDI_X_URL, process.env.NEXT_PUBLIC_HIDI_YOUTUBE_URL].filter((value): value is string => Boolean(value?.trim()));
export function generateMetadata(): Metadata {
  const index = isSearchIndexingEnabled();
  return { metadataBase: site, applicationName: "HIDI", title: { default: defaultTitle, template: "%s | HIDI" }, description: defaultDescription,
    openGraph: { type: "website", locale: "en_IN", siteName: "HIDI", url: "/", title: defaultTitle, description: defaultDescription, images: [{ url: "/brand/hidi-hero-green-garden-fullbody.webp", width: 1672, height: 941, alt: "HIDI Indian wear editorial" }] },
    twitter: { card: "summary_large_image", title: defaultTitle, description: defaultDescription, images: ["/brand/hidi-hero-green-garden-fullbody.webp"] },
    verification: process.env.GOOGLE_SITE_VERIFICATION?.trim() ? { google: process.env.GOOGLE_SITE_VERIFICATION.trim() } : undefined,
    robots: { index, follow: index, googleBot: { index, follow: index, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  };
}
const organizationJsonLd = { "@context": "https://schema.org", "@type": "Organization", "@id": absoluteUrl("/#organization"), name: "HIDI", url: absoluteUrl("/"), logo: absoluteUrl("/brand/hidi-logo-header.svg"), ...(socialProfiles.length ? { sameAs: socialProfiles } : {}) };
const websiteJsonLd = { "@context": "https://schema.org", "@type": "WebSite", "@id": absoluteUrl("/#website"), name: "HIDI", url: absoluteUrl("/"), publisher: { "@id": absoluteUrl("/#organization") } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN" suppressHydrationWarning><body suppressHydrationWarning><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd([organizationJsonLd, websiteJsonLd]) }} /><SiteShell>{children}</SiteShell></body></html>;
}
