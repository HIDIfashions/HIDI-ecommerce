"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Heart, House, LogOut, Package, RefreshCcw, Sparkles, WalletCards } from "lucide-react";
import { getAccessToken, signOut } from "@/lib/supabase-auth";
import styles from "./account-shell.module.css";

const sections = [
  { href: "/account", label: "Overview", icon: House, exact: true },
  { href: "/account/orders", label: "Orders", icon: Package, exact: false },
  { href: "/account/returns", label: "Aftercare", icon: RefreshCcw, exact: false },
  { href: "/account/rewards", label: "Rewards", icon: WalletCards, exact: false },
  { href: "/wishlist", label: "Wishlist", icon: Heart, exact: false },
  { href: "/account/preferences", label: "Preferences", icon: Sparkles, exact: false },
] as const;

export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const revision = useRef(0);

  useEffect(() => {
    let live = true;

    async function syncAuth() {
      const currentRevision = ++revision.current;
      const token = await getAccessToken().catch(() => null);
      if (!live || revision.current !== currentRevision) return;
      setAuthenticated(Boolean(token));
    }

    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key === "hidi_supabase_session") void syncAuth();
    }

    void syncAuth();
    window.addEventListener("hidi-auth-updated", syncAuth);
    window.addEventListener("storage", onStorage);
    return () => {
      live = false;
      revision.current += 1;
      window.removeEventListener("hidi-auth-updated", syncAuth);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    await signOut();
    window.location.assign("/account");
  }

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
          {authenticated && (
            <button type="button" className={styles.signOut} onClick={() => void logout()} disabled={signingOut}>
              <LogOut size={17} strokeWidth={1.55} aria-hidden="true" />
              <span>{signingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          )}
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
          {authenticated && (
            <button type="button" className={styles.mobileSignOut} onClick={() => void logout()} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          )}
        </nav>
        {children}
      </div>
    </div>
  );
}
