"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Filter, SlidersHorizontal, X } from "lucide-react";
import { ApiProduct } from "@/lib/api";
import { ProductCard } from "./product-card";
import styles from "./collection-browser.module.css";

const COLOR_SWATCHES: Record<string, string> = {
  Sage: "#9fa88d",
  Sand: "#c9b69d",
  Indigo: "#3f5577",
  Beige: "#d9c9b2",
  Olive: "#70764b",
  "Dusty Rose": "#c78f94",
  "Powder Blue": "#9db8d1",
  Blue: "#4f7fb7",
  Peach: "#dda790",
  Mint: "#a9c9b4",
  Ivory: "#f3eee3",
  Wine: "#6f2937",
  "Gold Beige": "#b99b63",
  Gold: "#c7a445",
  White: "#ffffff",
  "Off White": "#f1eee5",
  Black: "#292927",
  Green: "#6ba268",
  Pink: "#dda0b5",
  Red: "#c9575c",
  Yellow: "#ddca45",
  Maroon: "#8b334c",
  Purple: "#7d3f87",
  Silver: "#b7b8b6",
  Orange: "#dc8531",
  Brown: "#8a5840",
  Teal: "#3b8d8c",
  Mustard: "#c3953e",
  Grey: "#9ca3a6",
};

const LIGHT_SWATCHES = new Set(["White", "Off White", "Ivory", "Beige", "Sand"]);

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
  const colorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach((product) => {
      const availableColours = new Set(
        product.variants.filter((variant) => variant.available > 0).map((variant) => variant.color),
      );
      availableColours.forEach((colour) => {
        counts[colour] = (counts[colour] ?? 0) + 1;
      });
    });
    return counts;
  }, [products]);

  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedFabrics, setSelectedFabrics] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [sort, setSort] = useState("featured");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileColumns, setMobileColumns] = useState<1 | 2>(2);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

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
  const activeControlCount = selectedSizes.length + selectedColors.length + selectedFabrics.length + (price ? 1 : 0) + (sort !== "featured" ? 1 : 0);

  function clearFilters() {
    setSelectedSizes([]);
    setSelectedColors([]);
    setSelectedFabrics([]);
    setPrice("");
  }

  const sidebar = (
    <aside
      className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}
      aria-label="Product filters"
      aria-hidden={!mobileOpen}
      role="dialog"
      aria-modal={mobileOpen ? "true" : undefined}
    >
      <div className={styles.filterHeading}>
        <span className={styles.filterHeadingLabel}><SlidersHorizontal size={16} strokeWidth={1.6} /> Filter &amp; Sort</span>
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
          {colors.map((value) => <label className={styles.colorOption} key={value}>
            <input type="checkbox" checked={selectedColors.includes(value)} onChange={() => setSelectedColors((current) => toggleValue(current, value))} />
            <span
              className={`${styles.colorSwatch} ${LIGHT_SWATCHES.has(value) ? styles.colorSwatchLight : ""}`}
              style={{ backgroundColor: COLOR_SWATCHES[value] ?? "#b8b5ae" }}
              aria-hidden="true"
            />
            <span className={styles.colorLabel}>{value}</span>
            <span className={styles.colorCount}>({colorCounts[value] ?? 0})</span>
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

      <details className={styles.filterSection} open>
        <summary className={styles.filterSummary}><span>Sort</span><ChevronDown className={styles.chevron} size={16} strokeWidth={1.5} /></summary>
        <div className={styles.options}>
          {[
            ["featured", "Featured"],
            ["price-low", "Price: Low to high"],
            ["price-high", "Price: High to low"],
            ["name", "Name: A–Z"],
          ].map(([value, label]) => <label className={styles.option} key={value}>
            <input type="radio" name="catalog-sort" checked={sort === value} onChange={() => setSort(value)} />
            <span>{label}</span>
          </label>)}
        </div>
      </details>

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
    {sidebar}

    <div className={styles.layout}>
      <section className={styles.content}>
        <div className={styles.mobileCatalogueBar}>
          <button
            className={styles.mobileFilterSort}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <span>Filter &amp; Sort{activeControlCount ? ` (${activeControlCount})` : ""}</span>
            <ChevronRight size={17} strokeWidth={1.5} aria-hidden="true" />
          </button>

          <span className={styles.mobileProductCount}>{filtered.length} Products</span>

          <div className={styles.mobileGridSwitcher} aria-label="Product grid layout">
            <button
              type="button"
              className={mobileColumns === 2 ? styles.gridActive : undefined}
              aria-pressed={mobileColumns === 2}
              aria-label="Show two products per row"
              onClick={() => setMobileColumns(2)}
            >
              <span className={styles.twoGridIcon} aria-hidden="true"><i /><i /></span>
            </button>
            <button
              type="button"
              className={mobileColumns === 1 ? styles.gridActive : undefined}
              aria-pressed={mobileColumns === 1}
              aria-label="Show one product per row"
              onClick={() => setMobileColumns(1)}
            >
              <span className={styles.oneGridIcon} aria-hidden="true"><i /></span>
            </button>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <button
              className={styles.mobileFilterButton}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Filter size={16} strokeWidth={1.6} />
              Filter
              {hasFilters && <span className={styles.filterCount}>{selectedSizes.length + selectedColors.length + selectedFabrics.length + (price ? 1 : 0)}</span>}
            </button>
            <span className={styles.styleCount}>{filtered.length} styles</span>
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
          ? <div className={`${styles.productGrid} ${mobileColumns === 1 ? styles.gridOne : styles.gridTwo}`}>{filtered.map((product, index) => (
              <ProductCard key={product.id} product={product} priorityMedia={index < 2} />
            ))}</div>
          : <div className={styles.empty}><h2>No styles match those filters.</h2><p>Try clearing one or more filters.</p><button className="button button-light" type="button" onClick={clearFilters}>Clear filters</button></div>}
      </section>
    </div>
  </>;
}
