import type { Metadata } from "next";
import { AdminProcurementClient } from "./procurement-client";

export const metadata: Metadata = {
  title: "Procurement · HIDI Admin",
  description: "Vendor product master, invoice intake and end-to-end stock traceability",
};

export default function AdminProcurementPage() {
  return <AdminProcurementClient />;
}
