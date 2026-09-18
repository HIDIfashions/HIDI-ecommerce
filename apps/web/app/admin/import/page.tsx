import { ProductAccess } from "@/components/admin-products/product-access";
import { BulkImportClient } from "@/components/admin-import/bulk-import-client";
export const metadata = { title: "Bulk Import | HIDI Admin", robots: { index: false, follow: false } };
export default function BulkImportPage() { return <ProductAccess><BulkImportClient /></ProductAccess>; }
