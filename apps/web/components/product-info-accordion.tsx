"use client";
import Link from "next/link";
import { ProductCopy } from "./product-copy";
import { ChevronDown } from "lucide-react";
import type { ApiProduct } from "@/lib/api";
import { pdpInformation, type ProductSpecification } from "@/lib/pdp-information";
import { useProductSelection } from "@/lib/use-product-selection";
import { compareSizes } from "@/lib/product-card-utils";
import styles from "./product-info-accordion.module.css";
export function ProductInfoAccordion({ product, specifications = [] }: { product: ApiProduct; specifications?: ProductSpecification[] }) {
  const facts = pdpInformation(product, specifications);
  const { color } = useProductSelection(product);
  const sizes = product.inStock ? [...new Set(product.variants.filter(v => v.color === color && v.available > 0).map(v => v.size))].sort(compareSizes) : [];
  const designRows = [["Fabric", facts.fabric], ["Lining", facts.lining], ["Colour", color], ...facts.specifications.map(s => [s.label, s.value])].filter(([, value]) => value);
  const sections = [
    { key: "fabric", title: "Fabric & design", content: <>
      <dl className={styles.facts}>{designRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><ProductCopy text={value} /></dd></div>)}</dl>
      {facts.narrative && <ProductCopy text={facts.narrative} />}
    </> },
    { key: "pieces", title: "What’s included", content: facts.includes && <ProductCopy text={facts.includes} /> },
    { key: "sizing", title: "Size & fit", content: <>
      {facts.fit && <ProductCopy text={facts.fit} />}
      {facts.model && <ProductCopy text={facts.model} />}
      {sizes.length > 0 && <p>{sizes.join(" · ")}</p>}
      <button type="button" className={styles.guideLink} onClick={() => {
        const trigger = document.querySelector<HTMLButtonElement>('.pdp-purchase .size-row-title button[aria-controls]');
        if (trigger?.getAttribute("aria-expanded") !== "true") trigger?.click();
        trigger?.scrollIntoView({ block: "center", behavior: "smooth" });
        trigger?.focus({ preventScroll: true });
      }}>Size &amp; fit guide</button>
    </> },
    { key: "care", title: "Care instructions", content: <ProductCopy text={facts.care || "Follow the care label attached to the garment."} /> },
    { key: "delivery", title: "Delivery & returns", content: <>
      <p>Free shipping. Eligible items can be returned within 7 days of delivery, subject to HIDI’s return policy. Exchange eligibility, charges and availability follow the exchange policy.</p>
      <Link className={styles.guideLink} href="/returns#shipping-returns-exchange">View Shipping, Returns &amp; Exchange Policy</Link>
    </> },
  ];
  return <div className={styles.wrap} data-hidi-product-details>{sections.map(({ key, title, content }) => <details className={styles.section} key={key} data-product-detail={key} open={key === "fabric"}>
    <summary className={styles.summary}><span className={styles.titleWrap}>{title}</span><ChevronDown className={styles.chevron} size={18} strokeWidth={1.5} aria-hidden="true" /></summary>
    <div className={styles.content}>{content}</div>
  </details>)}</div>;
}
