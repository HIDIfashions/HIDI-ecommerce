import type { Metadata } from "next";
import { AdminLabelsClient } from "./admin-labels-client";

export const metadata: Metadata = {
  title: "Labels · HIDI Admin",
  description: "Generate HIDI SKU and order barcodes",
};

export default function AdminLabelsPage() {
  return <AdminLabelsClient />;
}
