import type { Metadata } from "next";
import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/api";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim().toLowerCase();
  const products = await getProducts();
  const matches = query
    ? products.filter((product) => {
        const haystack = [
          product.name,
          product.shortDescription ?? "",
          product.description ?? "",
          product.fabric ?? "",
          product.category?.name ?? "",
          product.collections.map((c) => c.name).join(" "),
          product.variants.map((v) => `${v.color} ${v.size}`).join(" "),
        ].join(" ").toLowerCase();
        return haystack.includes(query);
      })
    : [];

  return <div className="container collection-page search-page">
    <header className="collection-header compact">
      <p className="eyebrow">SEARCH HIDI</p>
      <h1>Find your next piece.</h1>
      <form action="/search" method="get" className="search-form">
        <input name="q" type="search" defaultValue={q} placeholder="Search by style, colour, collection…" autoFocus />
        <button className="button button-dark" type="submit">Search</button>
      </form>
    </header>

    {query ? <>
      <div className="filter-bar"><span>{matches.length} result{matches.length === 1 ? "" : "s"} for “{q}”</span></div>
      {matches.length ? <div className="product-grid">{matches.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="catalog-empty"><h2>No styles found.</h2><p>Try another product name, colour or collection.</p></div>}
    </> : <div className="catalog-empty"><h2>Start typing to search HIDI.</h2><p>Try “sage”, “work”, “ivory” or “kurta”.</p></div>}
  </div>;
}
