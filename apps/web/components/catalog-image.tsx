"use client";
import { useState } from "react";
import Image, { type ImageLoader } from "next/image";
import { canOptimizeProductImage, productImageSource } from "@/lib/product-image";
import { preferredProductDerivative, productMediaKey } from "@/lib/product-image-derivatives.mjs";

type CatalogImageProps = {
  src?: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  fallbackLabel?: string;
  className?: string;
};

const derivativeLoader: ImageLoader = ({ src, width }) =>
  preferredProductDerivative(src, width) ?? productImageSource(src);

export function CatalogImage({ src, alt, sizes, priority = false, fallbackLabel, className }: CatalogImageProps) {
  const [failure, setFailure] = useState<{ src: string; stage: "runtime" | "failed" } | null>(null);
  const delivery: "derivative" | "runtime" | "failed" =
    failure && failure.src === src ? failure.stage : "derivative";

  if (!src || delivery === "failed") {
    return <div aria-label={alt} className={className} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "linear-gradient(0deg, #541d1f 0 36px, transparent 56px), linear-gradient(145deg, var(--hidi-page-bg, #fbf6f2), var(--hidi-page-bg, #fbf6f2))" }}>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "clamp(54px, 8vw, 110px)", color: "rgba(255,255,255,.34)" }}>H</span>
      {fallbackLabel ? <span style={{ position: "absolute", left: 16, bottom: 14, color: "white", textTransform: "uppercase", letterSpacing: ".08em", fontSize: 12 }}>{fallbackLabel}</span> : null}
    </div>;
  }

  const persistentDerivativesEnabled = process.env.NEXT_PUBLIC_PERSISTENT_IMAGE_DERIVATIVES === "true";
  const canUsePersistentDerivative =
    persistentDerivativesEnabled &&
    delivery === "derivative" &&
    Boolean(productMediaKey(src));
  const runtimeSource = productImageSource(src);

  return <Image
    fill
    src={canUsePersistentDerivative ? src : runtimeSource}
    loader={canUsePersistentDerivative ? derivativeLoader : undefined}
    unoptimized={canUsePersistentDerivative ? false : !canOptimizeProductImage(runtimeSource)}
    alt={alt}
    sizes={sizes}
    loading={priority ? "eager" : "lazy"}
    fetchPriority={priority ? "high" : undefined}
    decoding="async"
    className={className}
    onError={() => setFailure({
      src,
      stage: delivery === "derivative" ? "runtime" : "failed",
    })}
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
  />;
}
