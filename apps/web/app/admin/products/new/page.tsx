import { ProductAccess } from "@/components/admin-products/product-access";
import { ProductEditor } from "@/components/admin-products/product-editor";
export const metadata = { title: "Create Product | HIDI Admin", robots: { index: false, follow: false } };
export default function NewProductPage() { return <ProductAccess><ProductEditor /></ProductAccess>; }
