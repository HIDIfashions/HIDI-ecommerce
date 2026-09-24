"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, LayoutGrid, Package, ShieldCheck, SlidersHorizontal, WalletCards } from "lucide-react";
import styles from "./account-shell.module.css";

type Props = {
  identity: string;
  onSignOut: () => void;
  signingOut?: boolean;
  children: React.ReactNode;
};

const nav = [
  { label: "Overview", href: "/account", icon: LayoutGrid },
  { label: "Orders & Aftercare", href: "/account/orders", icon: Package },
  { label: "HIDI Rewards", href: "/account#wallet", icon: WalletCards },
  { label: "Wishlist", href: "/wishlist", icon: Heart },
  { label: "Preferences", href: "/account#preferences", icon: SlidersHorizontal },
] as const;

export function AccountShell({ identity, onSignOut, signingOut = false, children }: Props) {
  const pathname = usePathname();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="My HIDI navigation">
        <div className={styles.identity}>
          <span className={styles.eyebrow}>MY HIDI</span>
          <strong>{identity}</strong>
          <span>Your wardrobe, aftercare and rewards.</span>
        </div>

        <nav className={styles.nav}>
          {nav.map(({ label, href, icon: Icon }) => {
            const active = href === "/account"
              ? pathname === "/account"
              : href === "/account/orders"
                ? pathname.startsWith("/account/orders")
                : false;
            return (
              <Link
                key={label}
                href={href}
                className={active ? styles.active : undefined}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={17} strokeWidth={1.55} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.assurance}>
          <ShieldCheck size={17} strokeWidth={1.5} aria-hidden="true" />
          <span>Secure account access with your verified mobile number.</span>
        </div>

        <button className={styles.signOut} type="button" onClick={onSignOut} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </aside>

      <div className={styles.mobileNavWrap}>
        <div className={styles.mobileIdentity}>
          <span>MY HIDI</span>
          <strong>{identity}</strong>
        </div>
        <nav className={styles.mobileNav} aria-label="My HIDI mobile navigation">
          {nav.slice(0, 4).map(({ label, href }) => {
            const active = href === "/account"
              ? pathname === "/account"
              : href === "/account/orders"
                ? pathname.startsWith("/account/orders")
                : false;
            return <Link key={label} href={href} className={active ? styles.activeMobile : undefined}>{label}</Link>;
          })}
        </nav>
      </div>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
