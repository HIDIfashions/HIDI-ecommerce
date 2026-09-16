"use client";

import { ChevronDown, ClipboardList, RotateCcw, Shirt, SquareCheckBig, Truck } from "lucide-react";
import { ApiProduct } from "@/lib/api";
import { COMMON_PRODUCT_DISCLAIMER, getProductInformation } from "@/lib/product-information";
import styles from "./product-info-accordion.module.css";

export function ProductInfoAccordion({ product }: { product: ApiProduct }) {
  const info = getProductInformation(product.slug);
  const colour = product.variants[0]?.color;

  return (
    <div className={styles.wrap}>
      <details className={styles.section}>
        <summary className={styles.summary}>
          <span className={styles.titleWrap}>
            <ClipboardList size={22} strokeWidth={1.5} aria-hidden="true" />
            <span>Disclaimer</span>
          </span>
          <ChevronDown className={styles.chevron} size={21} strokeWidth={1.5} aria-hidden="true" />
        </summary>
        <div className={styles.content}>
          {COMMON_PRODUCT_DISCLAIMER.map((line) => <p key={line}>{line}</p>)}
        </div>
      </details>

      <details className={styles.section} open>
        <summary className={styles.summary}>
          <span className={styles.titleWrap}>
            <Shirt size={22} strokeWidth={1.5} aria-hidden="true" />
            <span>Material &amp; Care</span>
          </span>
          <ChevronDown className={styles.chevron} size={21} strokeWidth={1.5} aria-hidden="true" />
        </summary>
        <div className={styles.content}>
          {product.fabric && <p><strong>Fabric:</strong> {product.fabric}</p>}
          <p><strong>Care:</strong> {product.care ?? "Follow the care label attached to the garment."}</p>
          {!/dry clean/i.test(product.care ?? "") && <>
            <p>Do not bleach.</p>
            <p>Iron on low heat.</p>
            <p>Dry in shade and store in a cool, dry place.</p>
          </>}
        </div>
      </details>

      <details className={styles.section}>
        <summary className={styles.summary}>
          <span className={styles.titleWrap}>
            <SquareCheckBig size={22} strokeWidth={1.5} aria-hidden="true" />
            <span>Specifications</span>
          </span>
          <ChevronDown className={styles.chevron} size={21} strokeWidth={1.5} aria-hidden="true" />
        </summary>
        <div className={styles.content}>
          <ul className={styles.specList}>
            {product.fabric && <li><strong>Fabric:</strong> {product.fabric}</li>}
            {colour && <li><strong>Colour:</strong> {colour}</li>}
            {info?.productType && <li><strong>Type:</strong> {info.productType}</li>}
            {info?.fitDetail && <li><strong>Fit &amp; detail:</strong> {info.fitDetail}</li>}
            {info?.edit && <li><strong>Edit:</strong> {info.edit}</li>}
          </ul>
        </div>
      </details>

      <details className={styles.section}>
        <summary className={styles.summary}>
          <span className={styles.titleWrap}>
            <Truck size={22} strokeWidth={1.5} aria-hidden="true" />
            <span>Shipping &amp; Returns</span>
          </span>
          <ChevronDown className={styles.chevron} size={21} strokeWidth={1.5} aria-hidden="true" />
        </summary>
        <div className={styles.content}>
          <p><strong>Shipping:</strong> Complimentary shipping on orders above ₹1,499.</p>
          <p><strong>Returns:</strong> Easy 7-day returns on eligible items.</p>
          <p className={styles.note}><RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" /> Items should be unused, unworn and returned with original tags and packaging. Promotional or final-sale exclusions, where applicable, will be shown before purchase.</p>
        </div>
      </details>
    </div>
  );
}
