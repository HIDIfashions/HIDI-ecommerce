"use client";
import { usePathname } from "next/navigation";
import { AnnouncementTicker } from "@/components/editorial-motion";
import { Header } from "@/components/header";
import { Footer } from "@/components/site-footer";
export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  if (isAdmin) return <>{children}</>;
  return <><a className="skip-link" href="#main-content">Skip to main content</a><AnnouncementTicker /><Header /><main id="main-content" tabIndex={-1}>{children}</main><Footer /></>;
}
