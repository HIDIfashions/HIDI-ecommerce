import type { Metadata } from "next";
import { WishlistPageClient } from "@/components/wishlist-page-client";
import { getProducts } from "@/lib/api";

export const metadata: Metadata = {
  title: "Wishlist",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const products = await getProducts();
  return <div className="container collection-page">
    <header className="collection-header compact">
      <p className="eyebrow">SAVED FOR LATER</p>
      <h1>Your wishlist.</h1>
      <p>Keep the HIDI pieces you want to come back to.</p>
    </header>
    <WishlistPageClient products={products} />
  </div>;
}
