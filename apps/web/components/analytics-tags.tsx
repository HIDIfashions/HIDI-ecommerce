"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

type AnalyticsTagsProps = {
  gaMeasurementId?: string;
  metaPixelId?: string;
};

function pagePath(pathname: string, search: string) {
  return search ? `${pathname}?${search}` : pathname;
}

export function AnalyticsTags({ gaMeasurementId, metaPixelId }: AnalyticsTagsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const firstPageView = useRef(true);

  useEffect(() => {
    if (firstPageView.current) {
      firstPageView.current = false;
      return;
    }
    const path = pagePath(pathname, search);
    if (gaMeasurementId && typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: path,
        page_location: window.location.href,
        page_title: document.title,
      });
    }
    if (metaPixelId && typeof window.fbq === "function") {
      window.fbq("track", "PageView");
    }
  }, [gaMeasurementId, metaPixelId, pathname, search]);

  if (!gaMeasurementId && !metaPixelId) return null;

  return <>
    {gaMeasurementId ? <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`} strategy="afterInteractive" />
      <Script id="hidi-ga4" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${gaMeasurementId}');
      `}</Script>
    </> : null}
    {metaPixelId ? <>
      <Script id="hidi-meta-pixel" strategy="afterInteractive">{`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${metaPixelId}');
        fbq('track', 'PageView');
      `}</Script>
      <noscript><img height="1" width="1" style={{ display: "none" }} alt="" src={`https://www.facebook.com/tr?id=${encodeURIComponent(metaPixelId)}&ev=PageView&noscript=1`} /></noscript>
    </> : null}
  </>;
}
