"use client";

import { useMemo, useState } from "react";
import { ApiProduct } from "@/lib/api";
import { ProductCard } from "./product-card";

export function CollectionBrowser({ products }: { products: ApiProduct[] }) {
  const sizes = useMemo(() => Array.from(new Set(products.flatMap((p) => p.variants.map((v) => v.size)))).sort(), [products]);
  const colors = useMemo(() => Array.from(new Set(products.flatMap((p) => p.variants.map((v) => v.color)))).sort(), [products]);
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [price, setPrice] = useState("");
  const [sort, setSort] = useState("featured");

  const filtered = useMemo(() => {
    const result = products.filter((product) => {
      if (size && !product.variants.some((v) => v.size === size && v.available > 0)) return false;
      if (color && !product.variants.some((v) => v.color === color && v.available > 0)) return false;
      if (price === "under1500" && product.minPricePaise >= 150000) return false;
      if (price === "1500to2000" && (product.minPricePaise < 150000 || product.minPricePaise > 200000)) return false;
      if (price === "over2000" && product.minPricePaise <= 200000) return false;
      return true;
    });
    return [...result].sort((a, b) => {
      if (sort === "price-low") return a.minPricePaise - b.minPricePaise;
      if (sort === "price-high") return b.minPricePaise - a.minPricePaise;
      if (sort === "name") return a.name.localeCompare(b.name);
      return 0;
    });
  }, [products, size, color, price, sort]);

  return <>
    <div className="filter-bar">
      <span>{filtered.length} styles</span>
      <div className="catalog-filters">
        <select aria-label="Filter by size" value={size} onChange={(e) => setSize(e.target.value)}><option value="">Size: All</option>{sizes.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <select aria-label="Filter by colour" value={color} onChange={(e) => setColor(e.target.value)}><option value="">Colour: All</option>{colors.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <select aria-label="Filter by price" value={price} onChange={(e) => setPrice(e.target.value)}><option value="">Price: All</option><option value="under1500">Under ₹1,500</option><option value="1500to2000">₹1,500–₹2,000</option><option value="over2000">Above ₹2,000</option></select>
        <select aria-label="Sort products" value={sort} onChange={(e) => setSort(e.target.value)}><option value="featured">Sort: Featured</option><option value="price-low">Price: Low to high</option><option value="price-high">Price: High to low</option><option value="name">Name: A–Z</option></select>
        {(size || color || price || sort !== "featured") && <button type="button" onClick={() => { setSize(""); setColor(""); setPrice(""); setSort("featured"); }}>Clear</button>}
      </div>
    </div>
    {filtered.length ? <div className="product-grid">{filtered.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="catalog-empty"><h2>No styles match those filters.</h2><p>Try clearing one or more filters.</p></div>}
  </>;
}
