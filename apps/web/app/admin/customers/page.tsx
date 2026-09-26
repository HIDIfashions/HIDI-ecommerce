import type { Metadata } from "next";
import { AdminCustomersClient } from "./admin-customers-client";

export const metadata: Metadata = {
  title: "Customers · HIDI Admin",
  description: "HIDI customer overview",
};

export default function AdminCustomersPage() {
  return <AdminCustomersClient />;
}
