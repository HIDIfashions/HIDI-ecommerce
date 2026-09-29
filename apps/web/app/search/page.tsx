import type { Metadata } from "next";
import { ProductCard } from "@/components/product-card";
import { matchesProductSearch } from "@/lib/catalogue-discovery";
import { getProducts } from "@/lib/api";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const params = await searchParams;
  const q = (Array.isArray(params.q) ? params.q[0] : params.q ?? "").slice(0, 160);
  const query = q.trim().toLowerCase();
  const products = await getProducts();
  const matches = query ? products.filter(product => matchesProductSearch(product, query)) : [];

  return <div className="container collection-page search-page">
    <header className="collection-header compact">
      <p className="eyebrow">SEARCH HIDI</p>
      <h1>Find your next piece.</h1>
      <form action="/search" method="get" className="search-form">
        <input name="q" type="search" aria-label="Search HIDI products" maxLength={160} defaultValue={q} placeholder="Search by style, colour, collection…" autoFocus />
        <button className="button button-dark" type="submit">Search</button>
      </form>
    </header>

    {query ? <>
      <div className="filter-bar"><span role="status">{matches.length} result{matches.length === 1 ? "" : "s"} for “{q}”</span></div>
      {matches.length ? <div className="product-grid">{matches.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="catalog-empty"><h2>No styles found.</h2><p>Try another product name, colour or collection.</p></div>}
    </> : <div className="catalog-empty"><h2>Start typing to search HIDI.</h2><p>Try “sage”, “work”, “ivory” or “kurta”.</p></div>}
  </div>;
}
