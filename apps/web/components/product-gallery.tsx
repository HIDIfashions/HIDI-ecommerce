"use client";

import Image from "next/image";
import { canOptimizeProductImage, productImageSource } from "@/lib/product-image";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { CatalogImage } from "./catalog-image";
import styles from "./product-gallery.module.css";
import { reviewedPortraitPhoto } from "@/lib/product-photo-framing.mjs";
import { focusFirst, trapFocus } from "@/lib/focus-management";
import { useImageZoom } from "./use-image-zoom";

type GalleryImage = {
  id?: string;
  url: string;
  alt: string;
  position?: number;
};

type ProductGalleryProps = {
  productName: string;
  images: GalleryImage[];
};

export function ProductGallery({ productName, images }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { zoom, pan, dragging, reset: resetView, zoomIn, zoomOut, handlers } = useImageZoom(direction => direction === 1 ? next() : previous());
  const galleryRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const selected = selectedIndex === null ? null : images[selectedIndex];

  function open(index: number, opener?: HTMLButtonElement | null) {
    if (!images[index]?.url) return;
    openerRef.current = opener ?? null;
    setSelectedIndex(index);
    resetView();
  }

  function close() {
    setSelectedIndex(null);
    resetView();
    window.requestAnimationFrame(() => openerRef.current?.focus({ preventScroll: true }));
  }

  function previous() {
    setSelectedIndex((current) => {
      if (current === null) return null;
      let candidate = current;
      for (let step = 0; step < images.length; step += 1) {
        candidate = (candidate - 1 + images.length) % images.length;
        if (images[candidate]?.url) return candidate;
      }
      return current;
    });
    resetView();
  }

  function next() {
    setSelectedIndex((current) => {
      if (current === null) return null;
      let candidate = current;
      for (let step = 0; step < images.length; step += 1) {
        candidate = (candidate + 1) % images.length;
        if (images[candidate]?.url) return candidate;
      }
      return current;
    });
    resetView();
  }

  useEffect(() => {
    if (selectedIndex === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => focusFirst(dialogRef.current), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowLeft") previous();
      if (event.key === "ArrowRight") next();
      if (event.key === "+" || event.key === "=") zoomIn();
      if (event.key === "-") zoomOut();
      trapFocus(event, dialogRef.current);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedIndex, images.length]);

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return;
    let frame = 0, lastTop = -1;
    const measure = () => {
      frame = 0;
      const header = document.querySelector(".site-header");
      const top = Math.max(0, header?.getBoundingClientRect().bottom ?? 128) + 16;
      if (top !== lastTop) { gallery.style.setProperty("--pdp-gallery-top", `${top}px`); lastTop = top; }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const header = document.querySelector(".site-header");
    const observer = new ResizeObserver(schedule);
    if (header) observer.observe(header);
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, []);

  return (
    <>
      <div ref={galleryRef} className={styles.galleryLayout}>
      <div className={styles.thumbnails} role="group" aria-label="Product photographs">
        {images.map((image, index) => <button key={image.id ?? index} type="button" aria-label={`View product image ${index + 1}`} aria-pressed={activeIndex === index} onClick={() => setActiveIndex(index)}>
          <CatalogImage src={image.url} alt={image.alt || productName} sizes="72px" />
        </button>)}
      </div>
      <div className={`pdp-gallery ${styles.gallery}`}>
        {images.map((image, index) => (
          <button
            key={image.id ?? `${image.url}-${index}`}
            type="button"
            className={`pdp-image product-art ${index === activeIndex ? styles.activeImage : styles.hiddenImage} ${index === 0 && reviewedPortraitPhoto(image.url) ? styles.portraitFrame : ""}`}
            data-hidi-portrait={index === 0 && reviewedPortraitPhoto(image.url) ? "true" : undefined}
            onClick={(event) => open(index, event.currentTarget)}
            aria-label={`Inspect ${image.alt || `${productName} image ${index + 1}`}`}
            title="Click to inspect stitching and details"
            style={{
              position: "relative",
              background: "var(--hidi-page-bg, #fbf6f2)",
              border: 0,
              padding: 0,
              margin: 0,
              width: "100%",
              display: "block",
              cursor: image.url ? "zoom-in" : "default",
              overflow: "hidden",
              font: "inherit",
            }}
          >
            <CatalogImage
              src={image.url}
              alt={image.alt || `${productName} image ${index + 1}`}
              sizes="(max-width: 760px) 100vw, 52vw"
              priority={index === 0}
              fallbackLabel={`Image ${index + 1} · HIDI product photography`}
            />
            <span
              className={styles.galleryCounter}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 14,
                top: 14,
                zIndex: 3,
                padding: "6px 8px",
                background: "var(--hidi-page-bg, #fbf6f2)",
                color: "#42352c",
                fontSize: 9,
                letterSpacing: ".12em",
                textTransform: "uppercase",
              }}
            >
              {String(index + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}
            </span>
            {image.url ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  right: 14,
                  bottom: 14,
                  zIndex: 3,
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background: "var(--hidi-page-bg, #fbf6f2)",
                  color: "#4a1719",
                  fontSize: 17,
                  boxShadow: "0 2px 12px rgba(0,0,0,.12)",
                }}
              >
                <Plus size={18} />
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <p className={styles.galleryHint}>{activeIndex + 1} / {images.length} <span>Tap image to zoom</span></p>
      </div>

      {selected && selectedIndex !== null ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          aria-label={`${productName} detailed image viewer`}
          className={styles.dialog}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className={styles.topBar}>
            <button type="button" className={styles.zoomButton} onClick={zoomOut} disabled={zoom <= 1} aria-label="Zoom out">
              <Minus size={18} />
            </button>
            <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
            <button type="button" className={styles.zoomButton} onClick={zoomIn} disabled={zoom >= 4.2} aria-label="Zoom in">
              <Plus size={18} />
            </button>
          </div>

          <div
            className={`${styles.viewport} ${dragging ? styles.viewportDragging : ""}`}
            {...handlers}
            title={zoom > 1 ? "Drag to inspect stitching details" : "Double-click or use + to zoom"}
          >
            <div
              className={styles.zoomLayer}
              style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
            >
              <Image
                src={productImageSource(selected.url)}
                unoptimized={!canOptimizeProductImage(productImageSource(selected.url))}
                alt={selected.alt || `${productName} enlarged image`}
                fill
                priority
                sizes="100vw"
                className={styles.image}
              />
            </div>
          </div>

          <div className={styles.controls} aria-label="Image controls">
            <button type="button" className={styles.navButton} onClick={previous} aria-label="Previous product image">
              <ChevronLeft size={23} />
            </button>
            <button type="button" className={styles.closeButton} onClick={close} aria-label="Close image viewer">
              <X size={24} />
            </button>
            <button type="button" className={styles.navButton} onClick={next} aria-label="Next product image">
              <ChevronRight size={23} />
            </button>
          </div>

          <div className={styles.counter}>
            {selectedIndex + 1} / {images.length}
          </div>
          <div className={styles.hint}>
            Scroll / + to zoom · Drag to inspect · Double-click to reset
          </div>
        </div>
      ) : null}
    </>
  );
}
