"use client";

import { useEffect, useRef } from "react";

/** Notify the preserved Azure wrapper only after React owns the product DOM. */
export function ProductPageShell({ children }: { children: React.ReactNode }) {
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    page.dataset.hidiHydrated = "true";
    window.dispatchEvent(new Event("hidi:product-ready"));
    return () => { delete page.dataset.hidiHydrated; };
  }, []);
  return <div ref={pageRef} className="container product-page" data-hidi-react-pdp="true">{children}</div>;
}
