"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, House, Package, Sparkles, WalletCards } from "lucide-react";
import styles from "./account-shell.module.css";

const sections = [
  { href: "/account", label: "Overview", icon: House, exact: true },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/rewards", label: "Rewards", icon: WalletCards },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/preferences", label: "Preferences", icon: Sparkles },
] as const;

export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function active(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="My HIDI navigation">
        <div className={styles.sidebarIntro}>
          <span>MY HIDI</span>
          <strong>Your wardrobe & rewards</strong>
        </div>
        <nav className={styles.nav}>
          {sections.map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              className={active(href, exact) ? styles.active : undefined}
              aria-current={active(href, exact) ? "page" : undefined}
            >
              <Icon size={17} strokeWidth={1.55} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className={styles.content}>
        <nav className={styles.mobileNav} aria-label="My HIDI sections">
          {sections.map(({ href, label, exact }) => (
            <Link
              key={href}
              href={href}
              className={active(href, exact) ? styles.mobileActive : undefined}
              aria-current={active(href, exact) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}
