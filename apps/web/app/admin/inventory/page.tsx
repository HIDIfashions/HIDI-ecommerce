import type { Metadata } from "next";
import { AdminInventoryClient } from "./admin-inventory-client";

export const metadata: Metadata = {
  title: "Inventory · HIDI Admin",
  description: "HIDI variant-level inventory control",
};

export default function AdminInventoryPage() {
  return <AdminInventoryClient />;
}
