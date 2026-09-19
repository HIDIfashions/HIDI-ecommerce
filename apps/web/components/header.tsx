import Link from "next/link";
import { Heart, Menu, UserRound } from "lucide-react";
import { CartLink } from "./cart-link";
import { HeaderSearch } from "./header-search";
import iconStyles from "./header-icons.module.css";

export function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <button className="mobile-menu" aria-label="Open menu">
          <Menu size={21} aria-hidden="true" />
        </button>

        <Link className="wordmark" href="/" aria-label="HIDI — Wear the Feeling">
          <img
            src="/brand/hidi-logo-gold-inline.svg"
            alt="HIDI — Wear the Feeling"
          />
        </Link>

        <nav className="desktop-nav" aria-label="Primary navigation">
          <Link href="/collections/new-arrivals">New Arrivals</Link>
          <Link href="/collections/work-edit">Work Edit</Link>
          <Link href="/collections/everyday">Everyday</Link>
          <Link href="/collections/occasion">Occasion</Link>
          <Link href="/collections/all">Shop All</Link>
        </nav>

        <nav className="utility-nav" aria-label="Utilities">
          <HeaderSearch />
          <Link href="/account" className={iconStyles.iconLink} aria-label="Account" title="Account">
            <UserRound className={iconStyles.icon} aria-hidden="true" />
          </Link>
          <Link href="/wishlist" className={iconStyles.iconLink} aria-label="Wishlist" title="Wishlist">
            <Heart className={iconStyles.icon} aria-hidden="true" />
          </Link>
          <CartLink />
        </nav>
      </div>
    </header>
  );
}
