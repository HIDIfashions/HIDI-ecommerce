import type { Metadata } from "next";
import "./globals.css";
import { SiteShell } from "@/components/site-shell";

const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";

export const metadata: Metadata = {
  title: {
    default: "HIDI — Indian wear for your everyday",
    template: "%s | HIDI",
  },
  description: "Quietly confident Indian wear designed for work, everyday and occasions.",
  robots: {
    index: !isStaging,
    follow: !isStaging,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
