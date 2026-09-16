"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { getCartSession } from "@/lib/cart-session";
import iconStyles from "./header-icons.module.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

export function CartLink() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;

    fetch(`${API}/carts/${getCartSession()}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (active && data) setCount(data.itemCount ?? 0);
      })
      .catch(() => undefined);

    const handler = (event: Event) => {
      setCount((event as CustomEvent<number>).detail ?? 0);
    };

    window.addEventListener("hidi-cart-updated", handler);
    return () => {
      active = false;
      window.removeEventListener("hidi-cart-updated", handler);
    };
  }, [pathname]);

  return (
    <Link
      href="/cart"
      className={iconStyles.iconLink}
      aria-label={`Bag with ${count} item${count === 1 ? "" : "s"}`}
      title="Bag"
    >
      <ShoppingBag className={iconStyles.icon} aria-hidden="true" />
      {count > 0 && <span className={iconStyles.count}>{count}</span>}
    </Link>
  );
}
