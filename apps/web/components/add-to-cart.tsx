"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPaise, type ApiProduct } from "@/lib/api";
import { WishlistButton } from "@/components/wishlist-button";
import { getCartSession } from "@/lib/cart-session";
import { PRODUCT_VARIANT_EVENT, publishProductSelection, type ProductVariantSelection } from "@/lib/product-sharing";
import styles from "./add-to-cart.module.css";

import { BROWSER_API_URL } from "@/lib/browser-api";
const API = BROWSER_API_URL;
export { PRODUCT_VARIANT_EVENT } from "@/lib/product-sharing";

const FIT_MEASUREMENTS = [
  { key: "bustMm", label: "Bust" },
  { key: "waistMm", label: "Waist" },
  { key: "hipMm", label: "Hip" },
  { key: "shoulderMm", label: "Shoulder" },
  { key: "sleeveLengthMm", label: "Sleeve" },
  { key: "garmentLengthMm", label: "Length" },
] as const;

type FitMeasurementKey = typeof FIT_MEASUREMENTS[number]["key"];

function formatFitMeasurement(mm: number | null | undefined, unit: "cm" | "in") {
  if (mm == null) return "—";
  if (unit === "in") return (mm / 25.4).toFixed(1);
  const cm = mm / 10;
  return Number.isInteger(cm) ? String(cm) : cm.toFixed(1);
}

export function AddToCart({ product }: { product: ApiProduct }) {
  const router = useRouter();
  const fitHelpId = useId();
  const colors = useMemo(() => Array.from(new Set(product.variants.map((v) => v.color))), [product]);
  const [color, setColor] = useState(colors[0] ?? "");
  const sizes = useMemo(
    () => product.variants.filter((v) => v.color === color).sort((a, b) => ["XS","S","M","L","XL","XXL","3XL"].indexOf(a.size) - ["XS","S","M","L","XL","XXL","3XL"].indexOf(b.size)),
    [product, color],
  );
  const [variantId, setVariantId] = useState("");
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState<"add" | "buy" | null>(null);
  const [fitHelp, setFitHelp] = useState(false);
  const [fitUnit, setFitUnit] = useState<"cm" | "in">("cm");

  useEffect(() => {
    function syncSelection(event: Event) {
      const detail = (event as CustomEvent<ProductVariantSelection>).detail;
      if (detail?.slug !== product.slug) return;
      const variant = product.variants.find((item) => item.id === detail.variantId);
      setColor(variant?.color ?? detail.color ?? colors[0] ?? "");
      setVariantId(variant?.id ?? "");
      setMessage("");
    }
    window.addEventListener(PRODUCT_VARIANT_EVENT, syncSelection);
    return () => window.removeEventListener(PRODUCT_VARIANT_EVENT, syncSelection);
  }, [product, colors]);

  function selectVariant(variant: ApiProduct["variants"][number]) {
    const deselecting = variant.id === variantId;
    setVariantId(deselecting ? "" : variant.id);
    setMessage("");
    publishProductSelection({
      slug: product.slug,
      variantId: deselecting ? "" : variant.id,
      size: deselecting ? undefined : variant.size,
      color: variant.color,
    });
  }

  const visibleFitMeasurements = FIT_MEASUREMENTS.filter(({ key }) =>
    sizes.some((variant) => variant[key as FitMeasurementKey] != null),
  );
  const hasVerifiedFit = visibleFitMeasurements.length > 0;

  async function add(destination: "bag" | "checkout" = "bag") {
    if (!variantId) { setMessage("Please select a size."); return; }
    setBusyAction(destination === "checkout" ? "buy" : "add");
    setMessage("");
    try {
      const response = await fetch(`${API}/carts/${getCartSession()}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, quantity: 1 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? "Unable to add item");
      window.dispatchEvent(new CustomEvent("hidi-cart-updated", { detail: data.itemCount }));
      if (destination === "checkout") {
        router.push("/checkout");
        return;
      }
      setMessage("Added to your bag.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add item. Please try again.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div>
      {colors.length > 1 && <>
        <div className="size-row-title"><strong>Colour</strong></div>
        <div className="colour-options">
          {colors.map((value) => <button key={value} type="button" aria-pressed={value === color} className={value === color ? "selected" : ""} onClick={() => {
            setColor(value);
            setVariantId("");
            setMessage("");
            publishProductSelection({ slug: product.slug, variantId: "", color: value });
          }}>{value}</button>)}
        </div>
      </>}
      <div className="size-row-title">
        <strong>HIDI Fit</strong>
        <button type="button" aria-expanded={fitHelp} aria-controls={fitHelpId} onClick={() => setFitHelp((value) => !value)}>
          Size &amp; fit guide
        </button>
      </div>
      {fitHelp && (
        <section id={fitHelpId} className={styles.fitGuide} aria-label="HIDI size and fit guide">
          <div className={styles.fitGuideHeader}>
            <div>
              <span>HIDI FIT</span>
              <strong>Garment measurements</strong>
            </div>
            {hasVerifiedFit && (
              <div className={styles.fitUnits} aria-label="Measurement unit">
                <button type="button" aria-pressed={fitUnit === "cm"} onClick={() => setFitUnit("cm")}>cm</button>
                <button type="button" aria-pressed={fitUnit === "in"} onClick={() => setFitUnit("in")}>in</button>
              </div>
            )}
          </div>

          {hasVerifiedFit ? (
            <>
              <div className={styles.fitTableWrap}>
                <table className={styles.fitTable}>
                  <thead>
                    <tr>
                      <th>Size</th>
                      {visibleFitMeasurements.map(({ key, label }) => <th key={key}>{label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sizes.map((variant) => (
                      <tr key={variant.id} className={variant.id === variantId ? styles.fitSelectedRow : undefined}>
                        <th>{variant.size}</th>
                        {visibleFitMeasurements.map(({ key }) => (
                          <td key={key}>{formatFitMeasurement(variant[key], fitUnit)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.fitNote}>
                These are finished-garment measurements, not body measurements. Bust, waist and hip are full garment circumferences. For the best comparison, measure a similar garment you already own.
              </p>
            </>
          ) : (
            <div className={styles.fitPending}>
              <strong>Verified measurements are not published for this style yet.</strong>
              <p>HIDI will not estimate garment measurements. Choose your usual size or use the WhatsApp fit support below if you want help before ordering.</p>
            </div>
          )}
        </section>
      )}
      <div className="sizes">
        {sizes.map((variant) => (
          <button
            key={variant.id}
            type="button"
            disabled={variant.available < 1}
            aria-pressed={variant.id === variantId}
            className={variant.id === variantId ? "selected" : ""}
            onClick={() => selectVariant(variant)}
            title={variant.available < 1 ? "Sold out" : variant.id === variantId ? `Unselect size ${variant.size}` : `${variant.available} available`}
          >{variant.size}</button>
        ))}
      </div>
      <div className={styles.purchaseActions} aria-label="Purchase actions">
        <button
          className={styles.addButton}
          type="button"
          disabled={busyAction !== null || !product.inStock || !variantId}
          onClick={() => void add("bag")}
        >
          {busyAction === "add" ? "Adding…" : "Add to Cart"}
        </button>
        <button
          className={styles.buyButton}
          type="button"
          disabled={busyAction !== null || !product.inStock || !variantId}
          onClick={() => void add("checkout")}
        >
          {busyAction === "buy" ? "Opening checkout…" : "Buy Now"}
        </button>
      </div>
      <p className={styles.helper}>
        {!product.inStock ? "This piece is currently sold out." : !variantId ? "Select a size to continue." : ""}
      </p>
      {message && <p className="inline-message pdp-add-message" role="status">{message}</p>}

      <div className={styles.mobileBar} aria-label="Mobile purchase actions">
        <div className={styles.mobilePrice}>
          <span>{variantId ? "Selected" : "From"}</span>
          <strong>{formatPaise(product.variants.find((variant) => variant.id === variantId)?.pricePaise ?? product.minPricePaise)}</strong>
        </div>
        <div className={styles.mobileWishlist}>
          <WishlistButton slug={product.slug} compact />
        </div>
        <div className={styles.mobileActions}>
          <button
            className={styles.mobileAdd}
            type="button"
            disabled={busyAction !== null || !product.inStock || !variantId}
            onClick={() => void add("bag")}
          >
            {busyAction === "add" ? "Adding…" : "Add to Cart"}
          </button>
          <button
            className={styles.mobileBuy}
            type="button"
            disabled={busyAction !== null || !product.inStock || !variantId}
            onClick={() => void add("checkout")}
          >
            {busyAction === "buy" ? "Opening…" : "Buy Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
