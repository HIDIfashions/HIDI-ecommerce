"use client";
import Link from "next/link";
import { ChevronDown, ClipboardList, Shirt, SquareCheckBig, Truck } from "lucide-react";
import type { ApiProduct } from "@/lib/api";
import { productFacts } from "@/lib/product-facts";
import { useProductSelection } from "@/lib/use-product-selection";
import { SHIPPING_COPY, RETURN_COPY, EXCHANGE_COPY } from "@/lib/shopping-guidance";
import styles from "./product-info-accordion.module.css";
export function ProductInfoAccordion({ product }: { product: ApiProduct }) {
  const facts = productFacts(product), { color } = useProductSelection(product);
  const sections = [
    { title: "Material & Care", icon: Shirt, content: <>
      <p><strong>Fabric:</strong> {facts.fabric || "Fabric information is not published for this style yet."}</p>
      <p><strong>Care:</strong> {facts.care || "Follow the care label attached to the garment."}</p>
    </> },
    { title: "Specifications", icon: SquareCheckBig, content: <>
      {color && <p><strong>Colour:</strong> {color}</p>}
      <p><strong>Included pieces:</strong> {facts.includes || "Not specified. Do not infer included items from photography."}</p>
      {facts.fit && <p><strong>Fit:</strong> {facts.fit}</p>}
      {facts.lining && <p><strong>Lining:</strong> {facts.lining}</p>}
      {facts.model && <p><strong>Model:</strong> {facts.model}</p>}
    </> },
    { title: "Shipping & Returns", icon: Truck, content: <>
      <p>{SHIPPING_COPY}</p><p>{RETURN_COPY}</p><p>{EXCHANGE_COPY}</p>
      <p><Link href="/shipping">Delivery and tracking guidance</Link> · <Link href="/returns">Return and exchange details</Link></p>
    </> },
    { title: "Photography & Colour", icon: ClipboardList, content: <p>Photographic lighting and screen settings may affect how colours appear. Use the listed product information and garment care label alongside the images.</p> },
  ];
  return <div className={styles.wrap}>{sections.map(({ title, icon: Icon, content }) => <details className={styles.section} key={title}>
    <summary className={styles.summary}><span className={styles.titleWrap}><Icon size={22} strokeWidth={1.5} aria-hidden="true" /><span>{title}</span></span><ChevronDown className={styles.chevron} size={21} strokeWidth={1.5} aria-hidden="true" /></summary>
    <div className={styles.content}>{content}</div>
  </details>)}</div>;
}
