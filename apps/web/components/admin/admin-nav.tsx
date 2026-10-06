"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const ITEMS = [
  { label: "Orders", href: "/admin/orders" },
  { label: "Products", href: "/admin/products" },
  { label: "Price Tags", href: "/admin/products/price-tags" },
  { label: "Imports", href: "/admin/import" },
  { label: "Inventory", href: "/admin/inventory" },
  { label: "Receive stock", href: "/admin/inventory/receive" },
  { label: "Customers", href: "/admin/customers" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => setRole(body?.admin?.role ?? null))
      .catch(() => undefined);
    const refresh = () => fetch("/api/admin/session", { method: "PUT" }).catch(() => undefined);
    const timer = window.setInterval(refresh, 40 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const items = role === "OWNER" ? [...ITEMS, { label: "Staff", href: "/admin/staff" } as const] : ITEMS;

  return (
    <nav aria-label="Admin navigation">
      {items.map((item) => {
        const active =
          item.href === "/admin/orders"
            ? pathname.startsWith("/admin/orders")
            : item.href === "/admin/products/price-tags"
              ? pathname.startsWith("/admin/products/price-tags")
              : item.href === "/admin/products"
                ? pathname.startsWith("/admin/products") && !pathname.startsWith("/admin/products/price-tags")
                : item.href === "/admin/customers"
                  ? pathname.startsWith("/admin/customers")
                  : item.href === "/admin/staff"
                    ? pathname.startsWith("/admin/staff")
                    : pathname === item.href;

        return active ? (
          <strong key={item.href}>{item.label}</strong>
        ) : (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
