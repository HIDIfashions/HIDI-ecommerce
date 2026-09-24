"use client";

import Link from "next/link";
import { Heart, Menu, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CartLink } from "./cart-link";
import { HeaderSearch } from "./header-search";
import iconStyles from "./header-icons.module.css";

const mobileLinks = [
  ["New Arrivals", "/collections/new-arrivals"],
  ["Work Edit", "/collections/work-edit"],
  ["Everyday", "/collections/everyday"],
  ["Occasion", "/collections/occasion"],
  ["Shop All", "/collections/all"],
] as const;

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="header-inner">
        <button
          className="mobile-menu"
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>

        <Link className="wordmark" href="/" aria-label="HIDI — Wear the Feeling" onClick={() => setMenuOpen(false)}>
          <img src="/brand/hidi-logo-gold-inline.svg" alt="HIDI — Wear the Feeling" />
        </Link>

        <nav className="desktop-nav" aria-label="Primary navigation">
          {mobileLinks.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>

        <nav className="utility-nav" aria-label="Utilities">
          <HeaderSearch />
          <Link href="/account" className={iconStyles.iconLink} aria-label="Account" title="Account">
            <UserRound className={iconStyles.icon} aria-hidden="true" />
          </Link>
          <Link href="/wishlist" className={`${iconStyles.iconLink} desktop-only`} aria-label="Wishlist" title="Wishlist">
            <Heart className={iconStyles.icon} aria-hidden="true" />
          </Link>
          <CartLink />
        </nav>
      </div>

      {menuOpen && (
        <>
          <button className="mobile-nav-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <nav id="mobile-navigation" className="mobile-nav-panel" aria-label="Mobile navigation">
            <div className="mobile-nav-links">
              {mobileLinks.map(([label, href]) => (
                <Link key={href} href={href} onClick={() => setMenuOpen(false)}>{label}<span aria-hidden="true">→</span></Link>
              ))}
            </div>
            <div className="mobile-nav-account">
              <Link href="/account" onClick={() => setMenuOpen(false)}><UserRound size={19} aria-hidden="true" /> My account</Link>
              <Link href="/wishlist" onClick={() => setMenuOpen(false)}><Heart size={19} aria-hidden="true" /> Wishlist</Link>
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
