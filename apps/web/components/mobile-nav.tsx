"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, Menu, UserRound, X } from "lucide-react";
import styles from "./mobile-nav.module.css";

const links = [
  ["New Arrivals", "/collections/new-arrivals"],
  ["Work Edit", "/collections/work-edit"],
  ["Everyday", "/collections/everyday"],
  ["Occasion", "/collections/occasion"],
  ["Shop All", "/collections/all"],
] as const;

export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        className="mobile-menu"
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="hidi-mobile-navigation"
        onClick={() => setOpen(true)}
      >
        <Menu size={22} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.layer}>
          <button
            type="button"
            className={styles.backdrop}
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />

          <aside
            id="hidi-mobile-navigation"
            className={styles.drawer}
            aria-label="Mobile navigation"
          >
            <div className={styles.top}>
              <Link href="/" className={styles.brand} onClick={() => setOpen(false)}>
                <img src="/brand/hidi-logo-gold-inline.svg" alt="HIDI — Wear the Feeling" />
              </Link>
              <button
                type="button"
                className={styles.close}
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>

            <p className={styles.kicker}>SHOP HIDI</p>

            <nav className={styles.nav}>
              {links.map(([label, href]) => (
                <Link key={href} href={href} onClick={() => setOpen(false)}>
                  <span>{label}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </nav>

            <div className={styles.accountLinks}>
              <Link href="/account" onClick={() => setOpen(false)}>
                <UserRound size={18} aria-hidden="true" />
                My account
              </Link>
              <Link href="/wishlist" onClick={() => setOpen(false)}>
                <Heart size={18} aria-hidden="true" />
                Wishlist
              </Link>
            </div>

            <p className={styles.note}>
              Indian wear designed for work, everyday and occasions.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
