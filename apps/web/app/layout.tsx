import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: {
    default: "HIDI — Indian wear for your everyday",
    template: "%s | HIDI",
  },
  description: "Quietly confident Indian wear designed for work, everyday and occasions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="announcement">Complimentary shipping above ₹1,499 · Easy 7-day returns</div>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
