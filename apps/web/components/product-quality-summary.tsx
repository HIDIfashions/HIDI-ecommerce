"use client";
import { SquareCheckBig } from "lucide-react";
import { ProductCopy } from "./product-copy";
import type { ApiProduct } from "@/lib/api";
import { pdpInformation, type ProductSpecification } from "@/lib/pdp-information";
import { useProductSelection } from "@/lib/use-product-selection";
import styles from "./product-quality-summary.module.css";
export function ProductQualitySummary({ product, specifications = [] }: { product: ApiProduct; specifications?: ProductSpecification[] }) {
  const facts = pdpInformation(product, specifications), { color } = useProductSelection(product);
  const rows = [["Included pieces", facts.includes], ["Fit", facts.fit], ["Colour", color], ["Model information", facts.model]].filter(([,value]) => value);
  return <section className={styles.wrap} aria-label="Product quality and fit summary">
    <div className={styles.heading}><SquareCheckBig size={22} strokeWidth={1.5} aria-hidden="true" /><h2>Product details</h2></div>
    <dl className={styles.facts}>{rows.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{label === "Colour" ? value : <ProductCopy text={value} />}</dd></div>)}{facts.specifications.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{label === "Colour" ? value : <ProductCopy text={value} />}</dd></div>)}</dl>

    {!facts.includes && <p className={styles.pending}>Included pieces are not specified for this style yet. Photography alone does not confirm the contents.</p>}
  </section>;
}
