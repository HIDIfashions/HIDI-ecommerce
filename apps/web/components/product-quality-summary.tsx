"use client";
import type { ApiProduct } from "@/lib/api";
import { productFacts } from "@/lib/product-facts";
import { useProductSelection } from "@/lib/use-product-selection";
import styles from "./product-quality-summary.module.css";
export function ProductQualitySummary({ product }: { product: ApiProduct }) {
  const facts = productFacts(product), { color } = useProductSelection(product);
  const rows = [["Fabric", facts.fabric], ["Included pieces", facts.includes], ["Fit", facts.fit], ["Lining", facts.lining], ["Colour", color], ["Care", facts.care], ["Model information", facts.model]].filter(([,value]) => value);
  return <section className={styles.wrap} aria-label="Product quality and fit summary">
    <div className={styles.heading}><p>KNOW THE PIECE</p><h2>The details, at a glance.</h2></div>
    <dl className={styles.facts}>{rows.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {!facts.includes && <p className={styles.pending}>Included pieces are not specified for this style yet. Photography alone does not confirm the contents.</p>}
  </section>;
}
