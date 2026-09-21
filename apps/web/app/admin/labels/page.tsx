import type { Metadata } from "next";
import { AdminLabelsClient } from "./admin-labels-client";

export const metadata: Metadata = {
  title: "Product labels · HIDI Admin",
  description: "Generate HIDI SKU product barcodes",
};

export default function AdminLabelsPage() {
  return <AdminLabelsClient />;
}
