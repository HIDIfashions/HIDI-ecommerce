"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="announcement">Complimentary shipping above ₹1,499 · Easy 7-day returns</div>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
