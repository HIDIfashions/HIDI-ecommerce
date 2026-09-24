import type { Metadata } from "next";
import { Cormorant_Garamond, Jost, Manrope } from "next/font/google";
import "./globals.css";
import { SiteShell } from "@/components/site-shell";

const hidiSans = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const hidiProduct = Jost({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jost",
  display: "swap",
});

const hidiDisplay = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "HIDI — Indian wear for your everyday",
    template: "%s | HIDI",
  },
  description: "Quietly confident Indian wear designed for work, everyday and occasions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${hidiSans.variable} ${hidiDisplay.variable} ${hidiProduct.variable}`}>
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
