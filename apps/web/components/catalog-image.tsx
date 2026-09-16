"use client";

import Image from "next/image";
import { useState } from "react";

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
          background: "linear-gradient(145deg, #eee2d2, #b99872)",
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
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      className={className}
      onError={() => setFailed(true)}
      style={{ objectFit: "cover", objectPosition: "center", display: "block" }}
    />
  );
}
