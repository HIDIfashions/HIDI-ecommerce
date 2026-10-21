"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { canOptimizeProductImage, productImageSource } from "@/lib/product-image";
type CatalogImageProps = { src?: string | null; alt: string; sizes: string; priority?: boolean; fallbackLabel?: string; className?: string; };
const MAX_IMAGE_RETRIES = 2;

export function CatalogImage({ src, alt, sizes, priority = false, fallbackLabel, className }: CatalogImageProps) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const source = src ? productImageSource(src) : "";

  useEffect(() => {
    setFailed(false);
    setAttempt(0);
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
    };
  }, [src]);

  if (!src || failed) return <div aria-label={alt} className={className} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "linear-gradient(0deg, #541d1f 0 36px, transparent 56px), linear-gradient(145deg, var(--hidi-page-bg, #fbf6f2), var(--hidi-page-bg, #fbf6f2))" }}>
    <span style={{ fontFamily: "var(--font-sans)", fontSize: "clamp(54px, 8vw, 110px)", color: "rgba(255,255,255,.34)" }}>H</span>
    {fallbackLabel ? <span style={{ position: "absolute", left: 16, bottom: 14, color: "white", textTransform: "uppercase", letterSpacing: ".08em", fontSize: 12 }}>{fallbackLabel}</span> : null}
  </div>;

  return <Image
    key={`${source}:${attempt}`}
    fill
    src={source}
    unoptimized={!canOptimizeProductImage(source)}
    alt={alt}
    sizes={sizes}
    loading={priority ? "eager" : "lazy"}
    fetchPriority={priority ? "high" : undefined}
    decoding="async"
    className={className}
    onError={() => {
      if (attempt < MAX_IMAGE_RETRIES) {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          setAttempt(current => current + 1);
        }, 350 * (attempt + 1));
        return;
      }
      setFailed(true);
    }}
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
  />;
}
