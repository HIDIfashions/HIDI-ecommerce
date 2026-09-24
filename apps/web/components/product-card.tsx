"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Heart, LoaderCircle, ShoppingBag, ArrowUpRight, Share2 } from "lucide-react";
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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [chooseSize, setChooseSize] = useState(false);
  const [bagLink, setBagLink] = useState(false);
  const adding = useRef(false);
  const sizesRef = useRef<HTMLDivElement>(null);
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
  const busy = phase === "adding";
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

  function clearFeedback() {
    setError(""); setMessage(""); setChooseSize(false); setBagLink(false); setPhase("idle");
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
    clearFeedback(); setVariantId(variant.id); rememberSelection(variant);
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

  async function add() {
    if (adding.current || !canBuy || phase === "added") return;
    setError(""); setMessage(""); setBagLink(false);
    if (!selected) {
      setChooseSize(true); setError("Choose your size above to add this piece.");
      sizesRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      return;
    }
    if (selected.available < 1) {
      setError("That size is no longer available. Please choose another.");
      setVariantId(""); router.refresh(); return;
    }
    adding.current = true; setPhase("adding"); setChooseSize(false);
    try {
      await addCatalogueVariant(selected.id);
      setPhase("added"); setMessage(`${selected.size} · ${selected.color} added to your bag.`); setBagLink(true);
    } catch (cause: unknown) {
      setPhase("idle"); setBagLink(true);
      setError(cause instanceof Error ? cause.message : "We couldn’t add this item. Please check your bag.");
      if (cause instanceof CatalogCartError && cause.refreshCatalogue) {
        setVariantId(""); router.refresh();
      }
    } finally { adding.current = false; }
  }

  return <article className={styles.card} aria-labelledby={`${uid}-name`}>
    <ProductCardMedia
      name={product.name}
      images={cardImages ?? []}
      videos={getProductCardVideos(product.slug)}
      soldOut={soldOut}
      href={href}
    />
    <div className={styles.body}>
      <p className={styles.eyebrow}>{product.fabric || product.category?.name || "THE HIDI EDIT"}</p>
      <h3 id={`${uid}-name`} className={styles.name}><Link href={href}>{product.name}</Link></h3>
      <div className={styles.priceRow} aria-live="polite" aria-atomic="true">
        <strong>{price.from && <span className={styles.from}>From </span>}{money(price.pricePaise)}</strong>
        {price.mrpPaise !== null && <><s aria-label={`MRP ${money(price.mrpPaise)}`}>{money(price.mrpPaise)}</s>
          <span className={styles.saving}>Save {money(price.savingPaise)}</span></>}
      </div>
      {colours.length > 1 ? <div className={styles.colours} role="group" aria-label={`Colour for ${product.name}`}>
        {colours.map((value) => {
          const hex = validColourHex(product.variants.find((entry) => entry.color === value)?.colorHex);
          return <button type="button" key={value} aria-pressed={activeColour === value}
            className={`${styles.colourButton} ${activeColour === value ? styles.colourActive : ""}`}
            disabled={busy} onClick={() => selectColour(value)}>
            {hex && <span className={styles.swatch} style={{ backgroundColor: hex }} aria-hidden="true" />}{value || "Standard"}
          </button>;
        })}
      </div> : <p className={styles.singleColour}>{activeColour || "Standard colour"}</p>}
      <div className={styles.quickShop}>
        <div className={styles.sizeHeading}>
          <span id={`${uid}-size`}>{selected ? `Your size: ${selected.size}` : "Choose your size"}</span>
          <Link href={href} className={styles.details}>Details <ArrowUpRight size={12} aria-hidden="true" /></Link>
        </div>
        <div ref={sizesRef} role="group" aria-labelledby={`${uid}-size`}
          aria-describedby={error ? `${uid}-error` : undefined}
          className={`${styles.sizes} ${chooseSize ? styles.needsSize : ""}`}>
          {variants.map((variant) => {
            const unavailable = !product.inStock || variant.available < 1;
            return <button key={variant.id} type="button" disabled={busy || unavailable}
              aria-pressed={selected?.id === variant.id}
              aria-label={`${variant.size}${unavailable ? " — sold out" : ""}`}
              title={unavailable ? `${variant.size} is sold out` : `Choose size ${variant.size}`}
              className={`${styles.sizeButton} ${selected?.id === variant.id ? styles.sizeActive : ""} ${unavailable ? styles.unavailable : ""}`}
              onClick={() => selectSize(variant)}>{variant.size}</button>;
          })}
        </div>
        <p className={styles.availability} aria-live="polite">
          {soldOut ? "Save this piece to revisit later."
            : !canBuy ? "This colour is sold out. Try another colour."
            : selected?.available === 0 ? "This size is currently unavailable."
            : selected && selected.available > 0 && selected.available <= 3 ? `Only ${selected.available} left in ${selected.size}`
            : selected ? `${selected.size} · ${selected.color}` : "Find your fit. Make it yours."}
        </p>
        <div className={styles.actions}>
          <button type="button" className={`${styles.addButton} ${phase === "added" ? styles.added : ""}`}
            disabled={busy || !canBuy || phase === "added"} aria-busy={busy}
            onClick={add} aria-label={`${!canBuy ? "Sold out" : "Add to Bag"} — ${product.name}`}>
            {busy ? <LoaderCircle className={styles.spinner} size={17} aria-hidden="true" />
              : phase === "added" ? <Check size={17} aria-hidden="true" /> : <ShoppingBag size={17} aria-hidden="true" />}
            <span>{busy ? "Adding…" : phase === "added" ? "Added" : !canBuy ? "Sold out" : "Add to Bag"}</span>
          </button>
          <button type="button" aria-pressed={saved} disabled={!wishlistReady || busy}
            aria-label={`${saved ? "Remove from" : "Add to"} wishlist — ${product.name}`}
            title={saved ? "Remove from wishlist" : "Save to wishlist"}
            className={`${styles.wishButton} ${saved ? styles.wishSaved : ""}`} onClick={toggleWishlist}>
            <Heart size={19} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.secondaryActions}>
          <button
            type="button"
            className={styles.whatsappAction}
            disabled={!whatsappConfigured}
            title={whatsappConfigured ? "Review your selection on the product page" : "WhatsApp ordering is not available yet"}
            onClick={orderOnWhatsapp}
            aria-label={`Order ${product.name} on WhatsApp${whatsappConfigured ? "" : " — not available yet"}`}
          >
            <WhatsAppIcon size={16} /> Order on WhatsApp
          </button>
          <button
            type="button"
            className={styles.shareAction}
            onClick={() => void share()}
            aria-label={`Share ${product.name} and get reward`}
          >
            <Share2 size={15} aria-hidden="true" /> Share and get reward
          </button>
        </div>
        <div className={styles.feedback}>
          <p className={styles.error} id={`${uid}-error`} role="alert">{error}</p>
          <p role="status">{message}</p>
          {bagLink && <Link href="/cart" className={styles.viewBag}>View bag <ArrowUpRight size={12} aria-hidden="true" /></Link>}
        </div>
      </div>
    </div>
  </article>;
}
