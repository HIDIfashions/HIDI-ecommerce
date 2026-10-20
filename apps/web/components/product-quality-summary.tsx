"use client";
import { ChevronDown, SquareCheckBig } from "lucide-react";
import { ProductCopy } from "./product-copy";
import type { ApiProduct } from "@/lib/api";
import { pdpInformation, type ProductSpecification } from "@/lib/pdp-information";
import { useProductSelection } from "@/lib/use-product-selection";
import styles from "./product-quality-summary.module.css";
export function ProductQualitySummary({ product, specifications = [] }: { product: ApiProduct; specifications?: ProductSpecification[] }) {
  const facts = pdpInformation(product, specifications), { color } = useProductSelection(product);
  const rows = [["Included pieces", facts.includes], ["Fit", facts.fit], ["Colour", color], ["Model information", facts.model]].filter(([,value]) => value);
  return <details className={styles.wrap} aria-label="Product quality and fit summary">
    <summary className={styles.heading}><SquareCheckBig size={22} strokeWidth={1.5} aria-hidden="true" /><h2>Product details</h2><ChevronDown className={styles.chevron} size={20} strokeWidth={1.5} aria-hidden="true" /></summary>
    <dl className={styles.facts}>{rows.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{label === "Colour" ? value : <ProductCopy text={value} />}</dd></div>)}{facts.specifications.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{label === "Colour" ? value : <ProductCopy text={value} />}</dd></div>)}</dl>

    {!facts.includes && <p className={styles.pending}>Included pieces are not specified for this style yet. Photography alone does not confirm the contents.</p>}
  </details>;
}
