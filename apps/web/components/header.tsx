"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Menu, UserRound, X } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CartLink } from "./cart-link";
import { HeaderSearch } from "./header-search";
import iconStyles from "./header-icons.module.css";
import { focusFirst, trapFocus } from "@/lib/focus-management";

const mobileLinks = [
  ["New Arrivals", "/collections/new-arrivals"],
  ["Workwear Edit", "/collections/work-edit"],
  ["Everyday", "/collections/everyday"],
  ["Occasion", "/collections/occasion"],
  ["Shop All", "/collections/all"],
] as const;

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLElement>(null);

  function closeMenu(restoreFocus = true) {
    setMenuOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => menuButtonRef.current?.focus({ preventScroll: true }));
    }
  }

  function handleWordmarkClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    closeMenu(false);
    if (pathname !== "/") return;
    event.preventDefault();
    window.scrollTo({ top: 0, left: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  // Measure the sticky header before the drawer paints; never guess its height.
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const header = headerRef.current;
    if (!header) return;

    const updatePosition = () => {
      if (window.innerWidth > 1000) {
        setMenuOpen(false);
        return;
      }
      header.style.setProperty(
        "--hidi-menu-top",
        `${Math.max(0, header.getBoundingClientRect().bottom)}px`,
      );
    };

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(header);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.visualViewport?.addEventListener("resize", updatePosition);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      header.style.removeProperty("--hidi-menu-top");
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
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
      document.documentElement.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const announcement = document.querySelector<HTMLElement>('[aria-label="HIDI shopping services"][role="region"]');
    const update = () => {
      setScrolled(window.scrollY > 24);
      document.documentElement.style.setProperty("--hidi-header-height", `${header.getBoundingClientRect().height}px`);
      document.documentElement.style.setProperty("--hidi-announcement-height", `${announcement?.getBoundingClientRect().height ?? 0}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    if (announcement) observer.observe(announcement);
    window.addEventListener("scroll", update, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener("scroll", update); };
  }, [pathname]);

  return (
    <header ref={headerRef} className="site-header" data-editorial-header data-home={pathname === "/"} data-scrolled={scrolled} data-menu-open={menuOpen}>
      <div className="header-inner">
        <button ref={menuButtonRef} className="mobile-menu" type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => menuOpen ? closeMenu(false) : setMenuOpen(true)}>{menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}</button>
        <a className="wordmark" href="/" aria-label="HIDI — Wear the Feeling" onClick={handleWordmarkClick}><img src="/brand/hidi-logo-header.svg?v=8f2e2b8731a3" alt="" /></a>
        <nav className="desktop-nav" aria-label="Primary navigation">{mobileLinks.map(([label, href]) => <Link key={href} href={href} prefetch={pathname === href ? false : undefined} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}</nav>
        <nav className="utility-nav" aria-label="Utilities">
          <HeaderSearch onOpen={() => closeMenu(false)} />
          <Link prefetch={false} href="/account" className={`${iconStyles.iconLink} desktop-only`} aria-label="Account" title="Account"><UserRound className={iconStyles.icon} aria-hidden="true" /></Link>
          <Link prefetch={false} href="/wishlist" className={`${iconStyles.iconLink} desktop-only`} aria-label="Wishlist" title="Wishlist"><Heart className={iconStyles.icon} aria-hidden="true" /></Link>
          <CartLink />
        </nav>
      </div>
      {menuOpen && <><button className="mobile-nav-backdrop" type="button" tabIndex={-1} aria-hidden="true" onClick={() => closeMenu(true)} />
        <nav ref={menuPanelRef} id="mobile-navigation" className="mobile-nav-panel" aria-label="Mobile navigation" aria-modal="true" role="dialog">
          <div className="mobile-nav-links">{mobileLinks.map(([label, href]) => <Link key={href} href={href} prefetch={pathname === href ? false : undefined} aria-current={pathname === href ? "page" : undefined} onClick={() => closeMenu(false)}>{label}<span aria-hidden="true">→</span></Link>)}</div>
          <div className="mobile-nav-account"><Link prefetch={false} href="/account" onClick={() => closeMenu(false)}><UserRound size={19} aria-hidden="true" /> My account</Link><Link prefetch={false} href="/wishlist" onClick={() => closeMenu(false)}><Heart size={19} aria-hidden="true" /> Wishlist</Link></div>
        </nav>
      </>}
    </header>
  );
}
