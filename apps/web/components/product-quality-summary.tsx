"use client";
import type { ApiProduct } from "@/lib/api";
import { pdpInformation, type ProductSpecification } from "@/lib/pdp-information";
import { useProductSelection } from "@/lib/use-product-selection";
import styles from "./product-quality-summary.module.css";
export function ProductQualitySummary({ product, specifications = [] }: { product: ApiProduct; specifications?: ProductSpecification[] }) {
  const facts = pdpInformation(product, specifications), { color } = useProductSelection(product);
  const rows = [["Fabric", facts.fabric], ["Included pieces", facts.includes], ["Fit", facts.fit], ["Lining", facts.lining], ["Colour", color], ["Care", facts.care], ["Model information", facts.model]].filter(([,value]) => value);
  const hasMeasurements = product.variants.some(variant => [variant.bustMm, variant.waistMm, variant.hipMm, variant.shoulderMm, variant.sleeveLengthMm, variant.garmentLengthMm].some(value => typeof value === "number" && value > 0));
  return <section className={styles.wrap} aria-label="Product quality and fit summary">
    <div className={styles.heading}><h2>Product details</h2></div>
    <dl className={styles.facts}>{rows.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}{facts.specifications.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {!hasMeasurements && <p className={styles.pending}>Garment measurements are not available for this style yet.</p>}
    {!facts.includes && <p className={styles.pending}>Included pieces are not specified for this style yet. Photography alone does not confirm the contents.</p>}
  </section>;
}
