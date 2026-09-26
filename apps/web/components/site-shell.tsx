"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/header";
import { Footer } from "@/components/site-footer";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) return <>{children}</>;

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div className="announcement">
        <span>Complimentary shipping on ₹1,499 and above</span>
        <span aria-hidden="true">•</span>
        <span>Easy exchange within 7 days</span>
        <span aria-hidden="true">•</span>
        <span>100% secure payments</span>
      </div>
      <Header />
      <main id="main-content" tabIndex={-1}>{children}</main>
      <Footer />
    </>
  );
}
