"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { CatalogImage } from "./catalog-image";

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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);

  const selected = selectedIndex === null ? null : images[selectedIndex];

  function open(index: number) {
    if (!images[index]?.url) return;
    setSelectedIndex(index);
    setZoomed(false);
  }

  function close() {
    setSelectedIndex(null);
    setZoomed(false);
  }

  function previous() {
    setSelectedIndex((current) => {
      if (current === null) return null;
      return (current - 1 + images.length) % images.length;
    });
    setZoomed(false);
  }

  function next() {
    setSelectedIndex((current) => {
      if (current === null) return null;
      return (current + 1) % images.length;
    });
    setZoomed(false);
  }

  useEffect(() => {
    if (selectedIndex === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") previous();
      if (event.key === "ArrowRight") next();
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
            onDoubleClick={() => open(index)}
            aria-label={`Expand ${image.alt || `${productName} image ${index + 1}`}`}
            title="Click to expand"
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
            {image.url ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  right: 14,
                  bottom: 14,
                  zIndex: 3,
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(255,255,255,.88)",
                  color: "#171714",
                  fontSize: 18,
                  boxShadow: "0 2px 12px rgba(0,0,0,.12)",
                }}
              >
                ⤢
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {selected && selectedIndex !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} enlarged image`}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(12,12,11,.94)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "28px 72px",
          }}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close enlarged image"
            style={{
              position: "fixed",
              top: 20,
              right: 24,
              zIndex: 10003,
              width: 44,
              height: 44,
              border: "1px solid rgba(255,255,255,.35)",
              borderRadius: "50%",
              background: "rgba(0,0,0,.28)",
              color: "white",
              cursor: "pointer",
              fontSize: 25,
              lineHeight: 1,
            }}
          >
            ×
          </button>

          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={previous}
                aria-label="Previous product image"
                style={{
                  position: "fixed",
                  left: 18,
                  top: "50%",
                  transform: "translateY(-50%)",
                  zIndex: 10003,
                  width: 48,
                  height: 60,
                  border: 0,
                  background: "rgba(0,0,0,.25)",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 36,
                }}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={next}
                aria-label="Next product image"
                style={{
                  position: "fixed",
                  right: 18,
                  top: "50%",
                  transform: "translateY(-50%)",
                  zIndex: 10003,
                  width: 48,
                  height: 60,
                  border: 0,
                  background: "rgba(0,0,0,.25)",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 36,
                }}
              >
                ›
              </button>
            </>
          ) : null}

          <div
            onDoubleClick={() => setZoomed((value) => !value)}
            title={zoomed ? "Double-click to zoom out" : "Double-click to zoom in"}
            style={{
              position: "relative",
              width: "min(88vw, 1050px)",
              height: "88vh",
              overflow: "hidden",
              cursor: zoomed ? "zoom-out" : "zoom-in",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: zoomed ? "scale(1.75)" : "scale(1)",
                transformOrigin: "center center",
                transition: "transform .2s ease",
              }}
            >
              <Image
                src={selected.url}
                alt={selected.alt || `${productName} enlarged image`}
                fill
                priority
                sizes="100vw"
                style={{ objectFit: "contain" }}
              />
            </div>
          </div>

          <div
            style={{
              position: "fixed",
              left: "50%",
              bottom: 16,
              transform: "translateX(-50%)",
              color: "rgba(255,255,255,.82)",
              fontSize: 12,
              letterSpacing: ".06em",
              whiteSpace: "nowrap",
            }}
          >
            {selectedIndex + 1} / {images.length} · Double-click image to zoom
          </div>
        </div>
      ) : null}
    </>
  );
}
