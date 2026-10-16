import { ProductAccess } from "@/components/admin-products/product-access";
import { ProductListClient } from "@/components/admin-products/product-list";
export const metadata = { title: "Products | HIDI Admin", robots: { index: false, follow: false } };
export default function ProductsPage() { return <ProductAccess><ProductListClient /></ProductAccess>; }
