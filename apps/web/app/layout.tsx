import type { Metadata } from "next";
import "./globals.css";
import { SiteShell } from "@/components/site-shell";
import { absoluteUrl, getSiteUrl, safeJsonLd } from "@/lib/site-url";

const site = getSiteUrl();
const defaultTitle = "HIDI — Indian wear for your everyday";
const defaultDescription = "Quietly confident Indian wear designed for work, everyday and occasions.";
const socialProfiles = [
  process.env.NEXT_PUBLIC_HIDI_INSTAGRAM_URL,
  process.env.NEXT_PUBLIC_HIDI_FACEBOOK_URL,
  process.env.NEXT_PUBLIC_HIDI_X_URL,
  process.env.NEXT_PUBLIC_HIDI_YOUTUBE_URL,
].filter((value): value is string => Boolean(value?.trim()));

export const metadata: Metadata = {
  metadataBase: site,
  applicationName: "HIDI",
  title: {
    default: defaultTitle,
    template: "%s | HIDI",
  },
  description: defaultDescription,
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "HIDI",
    url: "/",
    title: defaultTitle,
    description: defaultDescription,
    images: [
      {
        url: "/brand/hidi-hero-green-garden-fullbody.webp",
        width: 1672,
        height: 941,
        alt: "HIDI Indian wear editorial",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: ["/brand/hidi-hero-green-garden-fullbody.webp"],
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION?.trim()
    ? { google: process.env.GOOGLE_SITE_VERIFICATION.trim() }
    : undefined,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": absoluteUrl("/#organization"),
  name: "HIDI",
  url: absoluteUrl("/"),
  logo: absoluteUrl("/brand/hidi-logo-gold-inline.svg"),
  ...(socialProfiles.length ? { sameAs: socialProfiles } : {}),
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": absoluteUrl("/#website"),
  name: "HIDI",
  url: absoluteUrl("/"),
  publisher: { "@id": absoluteUrl("/#organization") },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd([organizationJsonLd, websiteJsonLd]) }}
        />
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
