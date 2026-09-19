"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { CatalogImage } from "./catalog-image";
import styles from "./product-gallery.module.css";

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

type Point = { x: number; y: number };

const ZOOM_LEVELS = [1, 1.8, 2.6, 3.4, 4.2] as const;

export function ProductGallery({ productName, images }: ProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const selected = selectedIndex === null ? null : images[selectedIndex];
  const zoom = ZOOM_LEVELS[zoomIndex];

  function resetView() {
    setZoomIndex(0);
    setPan({ x: 0, y: 0 });
    setDragging(false);
    drag.current = null;
  }

  function open(index: number) {
    if (!images[index]?.url) return;
    setSelectedIndex(index);
    resetView();
  }

  function close() {
    setSelectedIndex(null);
    resetView();
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

  function zoomIn() {
    setZoomIndex((current) => Math.min(current + 1, ZOOM_LEVELS.length - 1));
  }

  function zoomOut() {
    setZoomIndex((current) => {
      const target = Math.max(0, current - 1);
      if (target === 0) setPan({ x: 0, y: 0 });
      return target;
    });
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (zoom <= 1 || !event.isPrimary) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId || zoom <= 1) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setPan((current) => ({ x: current.x + dx, y: current.y + dy }));
  }

  function pointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
    setDragging(false);
  }

  function wheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.deltaY < 0) zoomIn();
    else zoomOut();
  }

  useEffect(() => {
    if (selectedIndex === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") previous();
      if (event.key === "ArrowRight") next();
      if (event.key === "+" || event.key === "=") zoomIn();
      if (event.key === "-") zoomOut();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedIndex, images.length]);

  return (
    <>
      <div className="pdp-gallery">
        {images.map((image, index) => (
          <button
            key={image.id ?? `${image.url}-${index}`}
            type="button"
            className="pdp-image product-art"
            onClick={() => open(index)}
            aria-label={`Inspect ${image.alt || `${productName} image ${index + 1}`}`}
            title="Click to inspect stitching and details"
            style={{
              position: "relative",
              background: "#eee8df",
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
              sizes="(max-width: 900px) 100vw, 38vw"
              priority={index === 0}
              fallbackLabel={`Image ${index + 1} · HIDI product photography`}
            />
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 14,
                top: 14,
                zIndex: 3,
                padding: "6px 8px",
                background: "rgba(255,253,249,.9)",
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
                  background: "rgba(255,255,255,.92)",
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

      {selected && selectedIndex !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} detailed image viewer`}
          className={styles.dialog}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className={styles.topBar}>
            <button type="button" className={styles.zoomButton} onClick={zoomOut} disabled={zoomIndex === 0} aria-label="Zoom out">
              <Minus size={18} />
            </button>
            <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
            <button type="button" className={styles.zoomButton} onClick={zoomIn} disabled={zoomIndex === ZOOM_LEVELS.length - 1} aria-label="Zoom in">
              <Plus size={18} />
            </button>
          </div>

          <div
            className={`${styles.viewport} ${dragging ? styles.viewportDragging : ""}`}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            onWheel={wheel}
            onDoubleClick={() => {
              if (zoomIndex === 0) setZoomIndex(2);
              else resetView();
            }}
            title={zoom > 1 ? "Drag to inspect stitching details" : "Double-click or use + to zoom"}
          >
            <div
              className={styles.zoomLayer}
              style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
            >
              <Image
                src={selected.url}
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
