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
        <Link className="wordmark" href="/">HIDI</Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
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
