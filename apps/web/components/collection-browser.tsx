"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Filter, SlidersHorizontal, X } from "lucide-react";
import { ApiProduct } from "@/lib/api";
import { ProductCard } from "./product-card";
import styles from "./collection-browser.module.css";

function toggleValue(current: string[], value: string) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

export function CollectionBrowser({ products }: { products: ApiProduct[] }) {
  const sizes = useMemo(
    () => Array.from(new Set(products.flatMap((p) => p.variants.map((v) => v.size)))).sort(),
    [products],
  );
  const colors = useMemo(
    () => Array.from(new Set(products.flatMap((p) => p.variants.map((v) => v.color)))).sort(),
    [products],
  );
  const fabrics = useMemo(
    () => Array.from(new Set(products.map((p) => p.fabric).filter((value): value is string => Boolean(value)))).sort(),
    [products],
  );

  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedFabrics, setSelectedFabrics] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [sort, setSort] = useState("featured");
  const [mobileOpen, setMobileOpen] = useState(false);

  const filtered = useMemo(() => {
    const result = products.filter((product) => {
      if (
        selectedSizes.length &&
        !product.variants.some((variant) => selectedSizes.includes(variant.size) && variant.available > 0)
      ) return false;

      if (
        selectedColors.length &&
        !product.variants.some((variant) => selectedColors.includes(variant.color) && variant.available > 0)
      ) return false;

      if (selectedFabrics.length && (!product.fabric || !selectedFabrics.includes(product.fabric))) return false;

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
  }, [products, selectedSizes, selectedColors, selectedFabrics, price, sort]);

  const hasFilters = selectedSizes.length > 0 || selectedColors.length > 0 || selectedFabrics.length > 0 || Boolean(price);

  function clearFilters() {
    setSelectedSizes([]);
    setSelectedColors([]);
    setSelectedFabrics([]);
    setPrice("");
  }

  const sidebar = (
    <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`} aria-label="Product filters">
      <div className={styles.filterHeading}>
        <span className={styles.filterHeadingLabel}><SlidersHorizontal size={16} strokeWidth={1.6} /> Filter</span>
        <span>
          {hasFilters && <button className={styles.clearButton} type="button" onClick={clearFilters}>Clear all</button>}
          <button className={styles.drawerClose} type="button" aria-label="Close filters" onClick={() => setMobileOpen(false)}><X size={22} strokeWidth={1.5} /></button>
        </span>
      </div>

      <details className={styles.filterSection} open>
        <summary className={styles.filterSummary}><span>Size</span><ChevronDown className={styles.chevron} size={16} strokeWidth={1.5} /></summary>
        <div className={styles.options}>
          {sizes.map((value) => <label className={styles.option} key={value}>
            <input type="checkbox" checked={selectedSizes.includes(value)} onChange={() => setSelectedSizes((current) => toggleValue(current, value))} />
            <span>{value}</span>
          </label>)}
        </div>
      </details>

      <details className={styles.filterSection} open>
        <summary className={styles.filterSummary}><span>Colour</span><ChevronDown className={styles.chevron} size={16} strokeWidth={1.5} /></summary>
        <div className={styles.options}>
          {colors.map((value) => <label className={styles.option} key={value}>
            <input type="checkbox" checked={selectedColors.includes(value)} onChange={() => setSelectedColors((current) => toggleValue(current, value))} />
            <span>{value}</span>
          </label>)}
        </div>
      </details>

      {fabrics.length > 0 && <details className={styles.filterSection}>
        <summary className={styles.filterSummary}><span>Fabric</span><ChevronDown className={styles.chevron} size={16} strokeWidth={1.5} /></summary>
        <div className={styles.options}>
          {fabrics.map((value) => <label className={styles.option} key={value}>
            <input type="checkbox" checked={selectedFabrics.includes(value)} onChange={() => setSelectedFabrics((current) => toggleValue(current, value))} />
            <span>{value}</span>
          </label>)}
        </div>
      </details>}

      <details className={styles.filterSection}>
        <summary className={styles.filterSummary}><span>Price</span><ChevronDown className={styles.chevron} size={16} strokeWidth={1.5} /></summary>
        <div className={styles.options}>
          {[
            ["", "All prices"],
            ["under1500", "Under ₹1,500"],
            ["1500to2000", "₹1,500–₹2,000"],
            ["over2000", "Above ₹2,000"],
          ].map(([value, label]) => <label className={styles.option} key={value || "all"}>
            <input type="radio" name="catalog-price" checked={price === value} onChange={() => setPrice(value)} />
            <span>{label}</span>
          </label>)}
        </div>
      </details>
    </aside>
  );

  return <>
    {mobileOpen && <button className={styles.drawerBackdrop} type="button" aria-label="Close filters" onClick={() => setMobileOpen(false)} />}
    <div className={styles.layout}>
      {sidebar}

      <section className={styles.content}>
        <div className={styles.toolbar}>
          <div>
            <button className={styles.mobileFilterButton} type="button" onClick={() => setMobileOpen(true)}>
              <Filter size={16} strokeWidth={1.6} /> Filter
            </button>
            <span className="desktop-only">{filtered.length} styles</span>
          </div>

          <div className={styles.toolbarRight}>
            <span className={styles.sortLabel}>Sort by</span>
            <select className={styles.sortSelect} aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="featured">Featured</option>
              <option value="price-low">Price: Low to high</option>
              <option value="price-high">Price: High to low</option>
              <option value="name">Name: A–Z</option>
            </select>
          </div>
        </div>

        {filtered.length
          ? <div className={styles.productGrid}>{filtered.map((product) => <ProductCard key={product.id} product={product} />)}</div>
          : <div className={styles.empty}><h2>No styles match those filters.</h2><p>Try clearing one or more filters.</p><button className="button button-light" type="button" onClick={clearFilters}>Clear filters</button></div>}
      </section>
    </div>
  </>;
}
