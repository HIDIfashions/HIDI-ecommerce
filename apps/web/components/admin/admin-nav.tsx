"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { label: "Orders", href: "/admin/orders" },
  { label: "Fulfilment", href: "/admin/fulfilment" },
  { label: "Products", href: "/admin/products" },
  { label: "Imports", href: "/admin/import" },
  { label: "Inventory", href: "/admin/inventory" },
  { label: "Receive stock", href: "/admin/inventory/receive" },
  { label: "Customers", href: "/admin/customers" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin navigation">
      {ITEMS.map((item) => {
        const active =
          item.href === "/admin/orders"
            ? pathname.startsWith("/admin/orders")
            : item.href === "/admin/fulfilment"
              ? pathname.startsWith("/admin/fulfilment")
              : item.href === "/admin/products"
              ? pathname.startsWith("/admin/products")
              : item.href === "/admin/customers"
                ? pathname.startsWith("/admin/customers")
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
