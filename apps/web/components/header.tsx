import Image from "next/image";
import Link from "next/link";
import { CartLink } from "./cart-link";

const Icon = ({ children }: { children: React.ReactNode }) => (
  <span className="header-icon" aria-hidden="true">{children}</span>
);

export function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <button className="mobile-menu" aria-label="Open menu">☰</button>
        <Link
          className="wordmark"
          href="/"
          aria-label="HIDI — Wear the Feeling"
          style={{ display: "inline-flex", alignItems: "center" }}
        >
          <Image
            src="/brand/hidi-logo-dark.png"
            alt="HIDI — Wear the Feeling"
            width={2172}
            height={724}
            priority
            sizes="(max-width: 720px) 122px, 168px"
            style={{
              width: "clamp(122px, 11vw, 168px)",
              height: "auto",
              display: "block",
            }}
          />
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <Link href="/collections/all">Shop All</Link>
          <Link href="/collections/new-arrivals">New Arrivals</Link>
          <Link href="/collections/work-edit">Work Edit</Link>
          <Link href="/collections/everyday">Everyday</Link>
          <Link href="/collections/occasion">Occasion</Link>
        </nav>
        <nav className="utility-nav" aria-label="Utilities">
          <Link href="/search" aria-label="Search"><Icon>⌕</Icon></Link>
          <Link href="/account" className="desktop-only">Account</Link>
          <Link href="/wishlist" aria-label="Wishlist"><Icon>♡</Icon></Link>
          <CartLink />
        </nav>
      </div>
    </header>
  );
}
