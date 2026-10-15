import type { ReactNode } from "react";
import "./desktop-option2.css";

/** CSS-only collection sizing; this fragment adds no mobile DOM or layout. */
export default function CollectionsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
