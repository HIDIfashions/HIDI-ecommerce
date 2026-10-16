import { ProductAccess } from "@/components/admin-products/product-access";
import { PriceTagPrinter } from "@/components/admin-products/price-tag-printer";

export const metadata = {
  title: "Price Tags | HIDI Admin",
  robots: { index: false, follow: false },
};

export default async function PriceTagsPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string | string[] }>;
}) {
  const params = await searchParams;
  const productId = typeof params.productId === "string" ? params.productId : undefined;
  return <ProductAccess><PriceTagPrinter initialProductId={productId} /></ProductAccess>;
}
