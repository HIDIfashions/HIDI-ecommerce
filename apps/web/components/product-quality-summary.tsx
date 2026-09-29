import { Check, Palette, Ruler, Sparkles } from "lucide-react";
import type { ApiProduct } from "@/lib/api";
import { getProductInformation } from "@/lib/product-information";
import styles from "./product-quality-summary.module.css";

export function ProductQualitySummary({ product }: { product: ApiProduct }) {
  const info = getProductInformation(product.slug);
  const colour = product.variants[0]?.color || "See colour options";

  return (
    <section className={styles.wrap} aria-label="Product quality and fit summary">
      <div className={styles.heading}>
        <p>KNOW THE PIECE</p>
        <h2>What to check before you choose.</h2>
      </div>

      <div className={styles.grid}>
        <div>
          <Sparkles size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>Fabric</span>
          <strong>{product.fabric || "See product description"}</strong>
          <p>Start with the fabric — it changes drape, structure, comfort and care.</p>
        </div>

        <div>
          <Ruler size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>Fit profile</span>
          <strong>{info?.fitDetail || info?.productType || "See size selection"}</strong>
          <p>Use the fit description together with your usual size before adding to bag.</p>
        </div>

        <div>
          <Palette size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>Colour</span>
          <strong>{colour}</strong>
          <p>Review all available product images; lighting and screens can shift colour slightly.</p>
        </div>

        <div>
          <Check size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>Care</span>
          <strong>{product.care || "Follow garment care label"}</strong>
          <p>Care requirements matter for repeat wear, especially with embroidery and delicate surfaces.</p>
        </div>
      </div>
    </section>
  );
}
