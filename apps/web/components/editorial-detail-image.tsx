"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { canOptimizeProductImage, productImageSource } from "@/lib/product-image";

/** Decorative alternate media is requested on mouse/keyboard intent, never on touch entry. */
export function EditorialDetailImage({ src, sizes, className }: { src: string; sizes: string; className: string }) {
  const layer = useRef<HTMLSpanElement>(null);
  const [requested, setRequested] = useState(false);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const source = productImageSource(src);
  useEffect(() => {
    const link = layer.current?.closest("a");
    if (!link) return;
    const reveal = () => {
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      if (connection?.saveData || /^(slow-)?2g$/.test(connection?.effectiveType ?? "")) return;
      setRequested(true); setActive(true);
    };
    const enter = (event: PointerEvent) => { if (event.pointerType === "mouse") reveal(); };
    const leave = () => setActive(false);
    link.addEventListener("pointerenter", enter);
    link.addEventListener("pointerleave", leave);
    link.addEventListener("focusin", reveal);
    link.addEventListener("focusout", leave);
    return () => {
      link.removeEventListener("pointerenter", enter);
      link.removeEventListener("pointerleave", leave);
      link.removeEventListener("focusin", reveal);
      link.removeEventListener("focusout", leave);
    };
  }, []);
  return <span ref={layer} className={className} aria-hidden="true" data-deferred-detail data-detail-ready={ready && !failed} style={{ opacity: active && ready && !failed ? 1 : 0, pointerEvents: "none" }}>
    {requested && !failed && <Image fill src={source} alt="" sizes={sizes} unoptimized={!canOptimizeProductImage(source)} loading="eager" onLoad={() => setReady(true)} onError={() => setFailed(true)} style={{ objectFit: "cover" }} />}
  </span>;
}
