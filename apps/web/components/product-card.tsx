"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Heart, LoaderCircle, ShoppingBag, ArrowUpRight, Share2, X } from "lucide-react";
import type { ApiProduct, ApiVariant } from "@/lib/api";
import { addCatalogueVariant, CatalogCartError } from "@/lib/catalog-cart";
import { cardPrice, money, validColourHex, variantsForColour } from "@/lib/product-card-utils";
import { getWishlistItems, removeWishlistSlug, saveWishlistItem, WISHLIST_EVENT } from "@/lib/wishlist";
import { ProductCardMedia } from "./product-card-media";
import { getProductCardVideos } from "@/lib/product-card-videos";
import { configuredWhatsAppNumber, shareProduct } from "@/lib/product-sharing";
import { WhatsAppIcon } from "./whatsapp-icon";
import styles from "./product-card.module.css";

type Props = { product: ApiProduct; initialVariantId?: string };
type Phase = "idle" | "adding" | "added";

export function ProductCard({ product, initialVariantId }: Props) {
  const router = useRouter();
  const uid = useId();
  const initial = product.variants.find((entry) => entry.id === initialVariantId && entry.available > 0);
  const colours = Array.from(new Set(product.variants.map((entry) => entry.color)));
  const [colour, setColour] = useState(initial?.color ?? colours[0] ?? "");
  // Never preselect a customer's size on a catalogue page.
  const [variantId, setVariantId] = useState(initial?.id ?? "");
  const [saved, setSaved] = useState(false);
  const [wishlistReady, setWishlistReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [chooseSize, setChooseSize] = useState(false);
  const [bagLink, setBagLink] = useState(false);
  const [mobileQuickOpen, setMobileQuickOpen] = useState(false);
  const adding = useRef(false);
  const sizesRef = useRef<HTMLDivElement>(null);
  const mobileRibbonRef = useRef<HTMLDivElement>(null);
  const desktopRibbonRef = useRef<HTMLDivElement>(null);
  const activeColour = colours.includes(colour) ? colour : colours[0] ?? "";
  const variants = variantsForColour(product.variants, activeColour);
  const selected = variants.find((entry) => entry.id === variantId);
  const colourImages = (() => {
    const seen = new Set<string>();
    return variants
      .flatMap((entry) => entry.images ?? [])
      .filter((image) => {
        if (!image.url || seen.has(image.url)) return false;
        seen.add(image.url);
        return true;
      })
      .sort((a, b) => a.position - b.position);
  })();
  const cardImages = colourImages.length ? colourImages : product.images;
  const canBuy = product.inStock && variants.some((entry) => entry.available > 0);
  const soldOut = !product.inStock || !product.variants.some((entry) => entry.available > 0);
  const busy = phase === "adding" || buying;
  const price = cardPrice(variants, selected?.id ?? "", product.minPricePaise);
  const href = `/products/${encodeURIComponent(product.slug)}`;
  const whatsappConfigured = Boolean(configuredWhatsAppNumber());

  useEffect(() => {
    const sync = () => {
      setSaved(getWishlistItems().some((entry) => entry.slug === product.slug));
      setWishlistReady(true);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "hidi_wishlist") sync();
    };
    sync();
    window.addEventListener(WISHLIST_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(WISHLIST_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, [product.slug]);

  useEffect(() => {
    if (phase !== "added") return;
    const timer = window.setTimeout(() => setPhase("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!mobileQuickOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setMobileQuickOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileQuickOpen, busy]);

  function clearFeedback() {
    setError(""); setMessage(""); setChooseSize(false); setBagLink(false); setPhase("idle"); setBuying(false);
  }

  function rememberSelection(variant?: ApiVariant, nextColour = activeColour) {
    if (!getWishlistItems().some((entry) => entry.slug === product.slug)) return;
    try {
      saveWishlistItem({ slug: product.slug, color: nextColour,
        ...(variant ? { variantId: variant.id, size: variant.size } : {}) });
    } catch { setError("Your selection changed, but browser storage could not update your wishlist."); }
  }

  function selectSize(variant: ApiVariant) {
    if (adding.current || variant.available < 1 || !product.inStock) return;
    const deselecting = variantId === variant.id;
    clearFeedback();
    setVariantId(deselecting ? "" : variant.id);
    rememberSelection(deselecting ? undefined : variant);
  }

  function selectColour(value: string) {
    if (adding.current || value === activeColour) return;
    clearFeedback(); setColour(value); setVariantId(""); rememberSelection(undefined, value);
  }

  function toggleWishlist() {
    if (!wishlistReady || adding.current) return;
    setError("");
    try {
      if (getWishlistItems().some((entry) => entry.slug === product.slug)) {
        removeWishlistSlug(product.slug);
        setSaved(false); setMessage("Removed from your wishlist.");
      } else {
        saveWishlistItem({ slug: product.slug, color: activeColour,
          ...(selected ? { variantId: selected.id, size: selected.size } : {}) });
        setSaved(true); setMessage("Saved to your wishlist on this browser.");
      }
    } catch { setError("We couldn’t save your wishlist. Please enable browser storage."); }
  }

  async function share() {
    setError("");
    setMessage("");
    try {
      const result = await shareProduct({
        slug: product.slug,
        name: product.name,
        text: `Take a look at ${product.name} from HIDI.`,
      });
      if (result === "copied") setMessage("Product link copied.");
      if (result === "unsupported") setMessage("Open the product and copy its address to share.");
    } catch {
      setMessage("Couldn’t share this time. Open the product and copy its address.");
    }
  }

  function orderOnWhatsapp() {
    if (!whatsappConfigured) return;
    const query = new URLSearchParams({ whatsapp: "1", colour: activeColour });
    if (selected) query.set("variant", selected.id);
    // The detail-page dialog refreshes stock and confirms size before handoff.
    router.push(href + "?" + query.toString());
  }

  async function add(destination: "bag" | "checkout" = "bag") {
    if (adding.current || !canBuy || phase === "added") return;
    setError(""); setMessage(""); setBagLink(false);
    if (!selected) {
      setChooseSize(true); setError("Choose your size above to continue.");
      const mobileVisible = typeof window !== "undefined" && window.matchMedia("(max-width: 620px)").matches;
      const sizeHost = mobileQuickOpen
        ? sizesRef.current
        : mobileVisible ? mobileRibbonRef.current : desktopRibbonRef.current;
      sizeHost?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      return;
    }
    if (selected.available < 1) {
      setError("That size is no longer available. Please choose another.");
      setVariantId(""); router.refresh(); return;
    }
    adding.current = true;
    setChooseSize(false);
    if (destination === "checkout") setBuying(true);
    else setPhase("adding");

    try {
      await addCatalogueVariant(selected.id);
      if (destination === "checkout") {
        router.push("/checkout");
        return;
      }
      setPhase("added");
      setMessage(`${selected.size} · ${selected.color} added to your bag.`);
      setBagLink(true);
    } catch (cause: unknown) {
      setPhase("idle"); setBuying(false); setBagLink(true);
      setError(cause instanceof Error ? cause.message : "We couldn’t add this item. Please check your bag.");
      if (cause instanceof CatalogCartError && cause.refreshCatalogue) {
        setVariantId(""); router.refresh();
      }
    } finally {
      adding.current = false;
      setBuying(false);
    }
  }

  return <article className={styles.card} aria-labelledby={`${uid}-name`}>
    <div className={styles.mediaWrap}>
      <ProductCardMedia
        name={product.name}
        images={cardImages ?? []}
        videos={getProductCardVideos(product.slug)}
        soldOut={soldOut}
        href={href}
      />

      <button
        type="button"
        className={styles.mobileImageHeart}
        aria-pressed={saved}
        disabled={!wishlistReady || busy}
        aria-label={`${saved ? "Remove from" : "Add to"} wishlist — ${product.name}`}
        onClick={toggleWishlist}
      >
        <Heart size={21} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
      </button>

      <button
        type="button"
        className={styles.mobileQuickAdd}
        disabled={!canBuy || busy}
        onClick={() => setMobileQuickOpen(true)}
        aria-label={`Quick add — ${product.name}`}
      >
        {soldOut ? "Sold out" : "Quick add"}
      </button>

    </div>
    <div className={styles.body}>
      <h3 id={`${uid}-name`} className={styles.name}><Link href={href}>{product.name}</Link></h3>
      <div className={styles.priceRow} aria-live="polite" aria-atomic="true">
        <strong>{price.from && <span className={styles.from}>From </span>}{money(price.pricePaise)}</strong>
        {price.mrpPaise !== null && <><s aria-label={`MRP ${money(price.mrpPaise)}`}>{money(price.mrpPaise)}</s>
          <span className={styles.saving}>Save {money(price.savingPaise)}</span></>}
      </div>
      <div className={styles.mobileInlineShop}>
        <div className={styles.fitRibbonWrap}>
          <div className={styles.fitRibbonLabel}>
            <span>HIDI FIT</span>
            <strong>{selected ? `Size ${selected.size}` : "Choose size"}</strong>
          </div>
          <div
            ref={mobileRibbonRef}
            className={`${styles.fitRibbon} ${chooseSize ? styles.fitRibbonNeedsChoice : ""}`}
            role="group"
            aria-label={`Choose size for ${product.name}`}
          >
            {variants.map((variant) => {
              const unavailable = !product.inStock || variant.available < 1;
              return (
                <button
                  key={variant.id}
                  type="button"
                  disabled={busy || unavailable}
                  aria-pressed={selected?.id === variant.id}
                  className={`${styles.fitRibbonSize} ${selected?.id === variant.id ? styles.fitRibbonSizeActive : ""} ${unavailable ? styles.fitRibbonSizeSoldOut : ""}`}
                  onClick={() => selectSize(variant)}
                  title={unavailable ? `${variant.size} sold out` : selected?.id === variant.id ? `Unselect size ${variant.size}` : `Choose size ${variant.size}`}
                >
                  <span>{variant.size}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.mobilePurchaseActions}>
          <button
            type="button"
            className={`${styles.mobileAddButton} ${phase === "added" ? styles.added : ""}`}
            disabled={busy || !canBuy || !selected || phase === "added"}
            aria-busy={phase === "adding"}
            onClick={() => void add("bag")}
          >
            {phase === "adding" ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
              : phase === "added" ? <Check size={16} aria-hidden="true" />
              : <ShoppingBag size={16} aria-hidden="true" />}
            <span>{phase === "adding" ? "Adding…" : phase === "added" ? "Added" : !canBuy ? "Sold out" : "Add to cart"}</span>
          </button>
          <button
            type="button"
            className={styles.mobileBuyButton}
            disabled={busy || !canBuy || !selected || phase === "added"}
            aria-busy={buying}
            onClick={() => void add("checkout")}
          >
            {buying ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" /> : null}
            <span>{buying ? "Opening…" : "Buy now"}</span>
          </button>
        </div>

        <p className={styles.mobileInlineFeedback} role={error ? "alert" : "status"}>
          {error || message || (!selected ? "Choose a size to add this piece." : "")}
        </p>
      </div>

      <div className={`${styles.quickShop} ${styles.desktopQuickShop}`}>
        <div className={styles.fitRibbonWrap}>
          <div className={styles.fitRibbonLabel}>
            <span>HIDI FIT</span>
            <strong>{selected ? `Size ${selected.size}` : "Choose size"}</strong>
          </div>
          <div
            ref={desktopRibbonRef}
            className={`${styles.fitRibbon} ${chooseSize ? styles.fitRibbonNeedsChoice : ""}`}
            role="group"
            aria-label={`Choose size for ${product.name}`}
          >
            {variants.map((variant) => {
              const unavailable = !product.inStock || variant.available < 1;
              return (
                <button
                  key={variant.id}
                  type="button"
                  disabled={busy || unavailable}
                  aria-pressed={selected?.id === variant.id}
                  className={`${styles.fitRibbonSize} ${selected?.id === variant.id ? styles.fitRibbonSizeActive : ""} ${unavailable ? styles.fitRibbonSizeSoldOut : ""}`}
                  onClick={() => selectSize(variant)}
                  title={unavailable ? `${variant.size} sold out` : selected?.id === variant.id ? `Unselect size ${variant.size}` : `Choose size ${variant.size}`}
                >
                  <span>{variant.size}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={`${styles.addButton} ${phase === "added" ? styles.added : ""}`}
            disabled={busy || !canBuy || !selected || phase === "added"} aria-busy={phase === "adding"}
            onClick={() => void add("bag")} aria-label={`${!canBuy ? "Sold out" : "Add to Bag"} — ${product.name}`}>
            {phase === "adding" ? <LoaderCircle className={styles.spinner} size={17} aria-hidden="true" />
              : phase === "added" ? <Check size={17} aria-hidden="true" /> : <ShoppingBag size={17} aria-hidden="true" />}
            <span>{phase === "adding" ? "Adding…" : phase === "added" ? "Added" : !canBuy ? "Sold out" : "Add to Bag"}</span>
          </button>
          <button
            type="button"
            className={styles.buyButton}
            disabled={busy || !canBuy || !selected || phase === "added"}
            aria-busy={buying}
            onClick={() => void add("checkout")}
            aria-label={`Buy now — ${product.name}`}
          >
            {buying ? <LoaderCircle className={styles.spinner} size={17} aria-hidden="true" /> : null}
            <span>{buying ? "Opening…" : "Buy Now"}</span>
          </button>
          <button type="button" aria-pressed={saved} disabled={!wishlistReady || busy}
            aria-label={`${saved ? "Remove from" : "Add to"} wishlist — ${product.name}`}
            title={saved ? "Remove from wishlist" : "Save to wishlist"}
            className={`${styles.wishButton} ${saved ? styles.wishSaved : ""}`} onClick={toggleWishlist}>
            <Heart size={19} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
          </button>
        </div>


        {(error || message || bagLink) && (
          <div className={styles.feedback}>
            {error && <p className={styles.error} id={`${uid}-error`} role="alert">{error}</p>}
            {message && <p role="status">{message}</p>}
            {bagLink && <Link href="/cart" className={styles.viewBag}>View bag <ArrowUpRight size={12} aria-hidden="true" /></Link>}
          </div>
        )}
      </div>
    </div>

    {mobileQuickOpen && typeof document !== "undefined" && createPortal(
      <div
        className={styles.mobileSheetBackdrop}
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) setMobileQuickOpen(false);
        }}
      >
        <section className={styles.mobileSheet} role="dialog" aria-modal="true" aria-labelledby={`${uid}-quick-title`}>
          <div className={styles.mobileSheetHandle} aria-hidden="true" />
          <button
            type="button"
            className={styles.mobileSheetClose}
            onClick={() => setMobileQuickOpen(false)}
            disabled={busy}
            aria-label="Close quick add"
          >
            <X size={20} aria-hidden="true" />
          </button>

          <div className={styles.mobileSheetHeader}>
            <div>
              <p>QUICK ADD</p>
              <h3 id={`${uid}-quick-title`}>{product.name}</h3>
              <span>{price.from ? "From " : ""}{money(price.pricePaise)}</span>
            </div>
            <Link href={href} onClick={() => setMobileQuickOpen(false)}>View details <ArrowUpRight size={12} aria-hidden="true" /></Link>
          </div>

          {colours.length > 1 ? (
            <div className={styles.mobileSheetSection}>
              <div className={styles.mobileSheetLabel}><span>Colour</span><strong>{activeColour}</strong></div>
              <div className={styles.mobileSheetColours} role="group" aria-label={`Colour for ${product.name}`}>
                {colours.map((value) => {
                  const hex = validColourHex(product.variants.find((entry) => entry.color === value)?.colorHex);
                  return <button
                    type="button"
                    key={value}
                    aria-pressed={activeColour === value}
                    className={activeColour === value ? styles.mobileSheetColourActive : styles.mobileSheetColour}
                    disabled={busy}
                    onClick={() => selectColour(value)}
                  >
                    {hex && <span className={styles.swatch} style={{ backgroundColor: hex }} aria-hidden="true" />}
                    {value || "Standard"}
                  </button>;
                })}
              </div>
            </div>
          ) : <div className={styles.mobileSheetSection}>
            <div className={styles.mobileSheetLabel}><span>Colour</span><strong>{activeColour || "Standard"}</strong></div>
          </div>}

          <div className={styles.mobileSheetSection}>
            <div className={styles.mobileSheetLabel}>
              <span>Choose your size</span>
              {selected && <strong>{selected.size}</strong>}
            </div>
            <div ref={sizesRef} className={`${styles.mobileSheetSizes} ${chooseSize ? styles.needsSize : ""}`} role="group" aria-label={`Size for ${product.name}`}>
              {variants.map((variant) => {
                const unavailable = !product.inStock || variant.available < 1;
                return <button
                  key={variant.id}
                  type="button"
                  disabled={busy || unavailable}
                  aria-pressed={selected?.id === variant.id}
                  className={`${styles.mobileSheetSize} ${selected?.id === variant.id ? styles.mobileSheetSizeActive : ""} ${unavailable ? styles.unavailable : ""}`}
                  onClick={() => selectSize(variant)}
                >
                  {variant.size}
                </button>;
              })}
            </div>
            <p className={styles.mobileSheetAvailability}>
              {selected && selected.available > 0 && selected.available <= 3
                ? `Only ${selected.available} left in ${selected.size}`
                : selected ? `${selected.size} · ${selected.color}` : "Select a size to continue."}
            </p>
          </div>

          {error && <p className={styles.mobileSheetError} role="alert">{error}</p>}
          {message && <p className={styles.mobileSheetMessage} role="status">{message}</p>}

          <button
            type="button"
            className={`${styles.mobileSheetAdd} ${phase === "added" ? styles.added : ""}`}
            disabled={busy || !canBuy || phase === "added"}
            aria-busy={busy}
            onClick={() => void add()}
          >
            {busy ? <LoaderCircle className={styles.spinner} size={17} aria-hidden="true" />
              : phase === "added" ? <Check size={17} aria-hidden="true" />
              : <ShoppingBag size={17} aria-hidden="true" />}
            {busy ? "Adding…" : phase === "added" ? "Added to bag" : "Add to bag"}
          </button>

          <button
            type="button"
            className={styles.mobileSheetBuy}
            disabled={busy || !canBuy || !selected || phase === "added"}
            aria-busy={buying}
            onClick={() => void add("checkout")}
          >
            {buying ? <LoaderCircle className={styles.spinner} size={17} aria-hidden="true" /> : null}
            {buying ? "Opening…" : "Buy now"}
          </button>

          <div className={styles.mobileSheetSecondary}>
            <button type="button" onClick={toggleWishlist} disabled={!wishlistReady || busy}>
              <Heart size={17} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
              {saved ? "Saved" : "Save"}
            </button>
            <button type="button" onClick={orderOnWhatsapp} disabled={!whatsappConfigured || busy}>
              <WhatsAppIcon size={17} className={styles.whatsappIcon} /> WhatsApp
            </button>
            <button type="button" onClick={() => void share()} disabled={busy}>
              <Share2 size={16} aria-hidden="true" /> Share
            </button>
          </div>

          {bagLink && <Link href="/cart" className={styles.mobileViewBag} onClick={() => setMobileQuickOpen(false)}>View bag <ArrowUpRight size={13} aria-hidden="true" /></Link>}
        </section>
      </div>,
      document.body,
    )}
  </article>;
}
