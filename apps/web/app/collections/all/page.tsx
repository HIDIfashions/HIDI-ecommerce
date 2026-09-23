import { CollectionBrowser } from "@/components/collection-browser";
import { getProducts } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ShopAllPage() {
  const products = await getProducts();

  return (
    <div className="container collection-page">
      <header className="collection-header">
        <p className="eyebrow">HIDI EDIT</p>
        <h1>Shop All</h1>
        <p>Explore the complete HIDI edit in one place.</p>
      </header>

      <CollectionBrowser products={products} />
    </div>
  );
}
