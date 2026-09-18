"use client";

import { MessageCircle, Share2 } from "lucide-react";
import type { ApiProduct } from "@/lib/api";
import { formatPaise } from "@/lib/api";
import { shareProduct, whatsappOrderUrl } from "@/lib/product-sharing";
import styles from "./product-contact-actions.module.css";

export function ProductContactActions({ product }: { product: ApiProduct }) {
  async function share() {
    try {
      await shareProduct({
        slug: product.slug,
        name: product.name,
        text: `Take a look at ${product.name} from HIDI.`,
      });
    } catch {
      // Native share cancellation needs no error UI.
    }
  }

  function order() {
    const first = product.variants.find((variant) => variant.available > 0) ?? product.variants[0];
    const url = whatsappOrderUrl({
      slug: product.slug,
      name: product.name,
      priceText: formatPaise(first?.pricePaise ?? product.minPricePaise),
      color: first?.color,
    });
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className={styles.actions}>
      <button type="button" onClick={() => void share()}>
        <Share2 size={17} aria-hidden="true" />
        Share product
      </button>
      <button type="button" className={styles.whatsapp} onClick={order}>
        <MessageCircle size={17} aria-hidden="true" />
        Order on WhatsApp
      </button>
    </div>
  );
}
