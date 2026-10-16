import { ProductAccess } from "@/components/admin-products/product-access";
import { ProductEditor } from "@/components/admin-products/product-editor";
export const metadata = { title: "Edit Product | HIDI Admin", robots: { index: false, follow: false } };
export default async function EditProductPage({ params }: { params: Promise<{ productId: string }> }) { const { productId } = await params; return <ProductAccess><ProductEditor productId={productId} /></ProductAccess>; }
