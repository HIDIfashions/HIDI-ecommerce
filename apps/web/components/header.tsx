"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Menu, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CartLink } from "./cart-link";
import { HeaderSearch } from "./header-search";
import iconStyles from "./header-icons.module.css";
import { focusFirst, trapFocus } from "@/lib/focus-management";

const mobileLinks = [
  ["New Arrivals", "/collections/new-arrivals"],
  ["Work Edit", "/collections/work-edit"],
  ["Everyday", "/collections/everyday"],
  ["Occasion", "/collections/occasion"],
  ["Shop All", "/collections/all"],
] as const;

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLElement>(null);

  function closeMenu(restoreFocus = true) {
    setMenuOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => menuButtonRef.current?.focus({ preventScroll: true }));
    }
  }

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => focusFirst(menuPanelRef.current), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      trapFocus(event, menuPanelRef.current);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="header-inner">
        <button
          ref={menuButtonRef}
          className="mobile-menu"
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => menuOpen ? closeMenu(false) : setMenuOpen(true)}
        >
          {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>

        <Link className="wordmark" href="/" aria-label="HIDI — Wear the Feeling" onClick={() => closeMenu(false)}>
          <img src="/brand/hidi-logo-gold-inline.svg" alt="" />
        </Link>

        <nav className="desktop-nav" aria-label="Primary navigation">
          {mobileLinks.map(([label, href]) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>
          ))}
        </nav>

        <nav className="utility-nav" aria-label="Utilities">
          <HeaderSearch />
          <Link href="/account" className={`${iconStyles.iconLink} desktop-only`} aria-label="Account" title="Account">
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
          <button
            className="mobile-nav-backdrop"
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => closeMenu(true)}
          />
          <nav
            ref={menuPanelRef}
            id="mobile-navigation"
            className="mobile-nav-panel"
            aria-label="Mobile navigation"
            aria-modal="true"
            role="dialog"
          >
            <div className="mobile-nav-links">
              {mobileLinks.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={pathname === href ? "page" : undefined}
                  onClick={() => closeMenu(false)}
                >
                  {label}<span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
            <div className="mobile-nav-account">
              <Link href="/account" onClick={() => closeMenu(false)}><UserRound size={19} aria-hidden="true" /> My account</Link>
              <Link href="/wishlist" onClick={() => closeMenu(false)}><Heart size={19} aria-hidden="true" /> Wishlist</Link>
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
