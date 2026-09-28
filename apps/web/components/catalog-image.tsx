"use client";

import { useState } from "react";
import Image from "next/image";
import { canOptimizeProductImage, productImageSource } from "@/lib/product-image";

type CatalogImageProps = {
  src?: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  fallbackLabel?: string;
  className?: string;
};

export function CatalogImage({ src, alt, sizes, priority = false, fallbackLabel, className }: CatalogImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        aria-label={alt}
        className={className}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background: "linear-gradient(0deg, #541d1f 0 36px, transparent 56px), linear-gradient(145deg, var(--hidi-page-bg, #fbf6f2), var(--hidi-page-bg, #fbf6f2))",
        }}
      >
        <span style={{ fontFamily: "Georgia, serif", fontSize: "clamp(54px, 8vw, 110px)", color: "rgba(255,255,255,.34)" }}>H</span>
        {fallbackLabel ? (
          <span
            style={{
              position: "absolute",
              left: 16,
              bottom: 14,
              color: "white",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              fontSize: 9,
            }}
          >
            {fallbackLabel}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <Image
      fill
      src={productImageSource(src)}
      unoptimized={!canOptimizeProductImage(productImageSource(src))}
      alt={alt}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "center",
        display: "block",
      }}
    />
  );
}
