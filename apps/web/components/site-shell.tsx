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
      <div className="announcement">
        <div className="announcement-desktop">
          <span>Complimentary shipping above ₹1,499</span>
          <span aria-hidden="true">•</span>
          <span>Easy exchange within 7 days</span>
          <span aria-hidden="true">•</span>
          <span>100% secure payments</span>
        </div>
        <span className="announcement-mobile">Free shipping ₹1,499+ · 7-day exchange</span>
      </div>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
