"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type ApiProduct } from "@/lib/api";
import { WishlistButton } from "@/components/wishlist-button";
import Link from "next/link";
import { addCatalogueVariant, CatalogCartError } from "@/lib/catalog-cart";
import { cardPrice, money, compareSizes } from "@/lib/product-card-utils";
import { PRODUCT_VARIANT_EVENT, publishProductSelection, type ProductVariantSelection } from "@/lib/product-sharing";
import styles from "./add-to-cart.module.css";

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
  if (mm == null || !Number.isFinite(mm) || mm <= 0) return "—";
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
    () => product.variants.filter((v) => v.color === color).sort((a, b) => compareSizes(a.size, b.size)),
    [product, color],
  );
  const [variantId, setVariantId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const writing = useRef(false);
  const selected = sizes.find(v => v.id === variantId && v.available > 0 && !unavailable.includes(v.id));
  const price = cardPrice(sizes, selected?.id ?? "", product.minPricePaise);
  const [busyAction, setBusyAction] = useState<"add" | "buy" | null>(null);
  const [fitHelp, setFitHelp] = useState(false);
  const [fitUnit, setFitUnit] = useState<"cm" | "in">("cm");

  useEffect(() => {
    function syncSelection(event: Event) {
      const detail = (event as CustomEvent<ProductVariantSelection>).detail;
      if (writing.current || detail?.slug !== product.slug || !colors.includes(detail.color)) return;
      const variant = product.variants.find((item) => item.id === detail.variantId && item.available > 0 && !unavailable.includes(item.id));
      setColor(variant?.color ?? detail.color ?? colors[0] ?? "");
      setVariantId(variant?.id ?? "");
      setMessage("");
    }
    window.addEventListener(PRODUCT_VARIANT_EVENT, syncSelection);
    return () => window.removeEventListener(PRODUCT_VARIANT_EVENT, syncSelection);
  }, [product, colors, unavailable]);

  function selectVariant(variant: ApiProduct["variants"][number]) {
    if (writing.current || variant.available < 1 || unavailable.includes(variant.id) || !product.inStock) return;
    setError("");
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
    sizes.some((variant) => Number.isFinite(variant[key as FitMeasurementKey]) && (variant[key as FitMeasurementKey] ?? 0) > 0),
  );
  const hasVerifiedFit = visibleFitMeasurements.length > 0;

  async function add(destination: "bag" | "checkout" = "bag") {
    if (writing.current || !product.inStock) return;
    if (!selected) { setError("Please select an available size."); return; }
    writing.current = true;
    setBusyAction(destination === "checkout" ? "buy" : "add"); setMessage(""); setError("");
    try {
      await addCatalogueVariant(selected.id);
      if (destination === "checkout") router.push("/checkout");
      else setMessage(`Size ${selected.size} · ${selected.color} added to your bag.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn’t confirm the update. Check your bag before trying again.");
      if (cause instanceof CatalogCartError && cause.refreshCatalogue) {
        setUnavailable(current => [...current, selected.id]); setVariantId("");
        publishProductSelection({ slug: product.slug, variantId: "", color }); router.refresh();
      }
    } finally { writing.current = false; setBusyAction(null); }
  }

  return (
    <div>
      {colors.length > 1 && <>
        <div className="size-row-title"><strong>Colour</strong></div>
        <div className="colour-options">
          {colors.map((value) => <button key={value} type="button" disabled={busyAction !== null} aria-pressed={value === color} className={value === color ? "selected" : ""} onClick={() => {
            if (writing.current || value === color) return;
            setError("");
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
              <p>HIDI will not estimate garment measurements. Compare a similar garment you own with the measurements when available. Size labels alone do not confirm fit.</p>
            </div>
          )}
        </section>
      )}
      <div className="sizes">
        {sizes.map((variant) => (
          <button
            key={variant.id}
            type="button"
            disabled={busyAction !== null || !product.inStock || variant.available < 1 || unavailable.includes(variant.id)}
            aria-label={variant.size + (variant.available < 1 || unavailable.includes(variant.id) ? " — unavailable" : "")}
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
          disabled={busyAction !== null || !product.inStock || !selected}
          onClick={() => void add("bag")}
        >
          {busyAction === "add" ? "Adding…" : "Add to Cart"}
        </button>
        <button
          className={styles.buyButton}
          type="button"
          disabled={busyAction !== null || !product.inStock || !selected}
          onClick={() => void add("checkout")}
        >
          {busyAction === "buy" ? "Opening checkout…" : "Buy Now"}
        </button>
      </div>
      <p className={styles.helper}>
        {!product.inStock ? "This piece is currently sold out." : !variantId ? "Select a size to continue." : ""}
      </p>
      <p className="inline-message pdp-add-message" role="status" aria-live="polite">{message}</p>
      {error && <p className="inline-message" role="alert">{error} <Link href="/cart">Review your bag</Link></p>}

      <div className={styles.mobileBar} aria-label="Mobile purchase actions">
        <div className={styles.mobilePrice}>
          <span>{selected ? "Selected" : price.from ? "From" : "Price"}</span>
          <strong>{money(price.pricePaise)}</strong>
        </div>
        <div className={styles.mobileWishlist}>
          <WishlistButton slug={product.slug} compact />
        </div>
        <div className={styles.mobileActions}>
          <button
            className={styles.mobileAdd}
            type="button"
            disabled={busyAction !== null || !product.inStock || !selected}
            onClick={() => void add("bag")}
          >
            {busyAction === "add" ? "Adding…" : "Add to Cart"}
          </button>
          <button
            className={styles.mobileBuy}
            type="button"
            disabled={busyAction !== null || !product.inStock || !selected}
            onClick={() => void add("checkout")}
          >
            {busyAction === "buy" ? "Opening…" : "Buy Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
