"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) return <>{children}</>;

  return (
    <>
      <div className="announcement">
        <span>Complimentary shipping above ₹1,499</span>
        <span aria-hidden="true">•</span>
        <span>Easy 7-day exchange</span>
        <span aria-hidden="true">•</span>
        <span>Secure payments</span>
      </div>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
