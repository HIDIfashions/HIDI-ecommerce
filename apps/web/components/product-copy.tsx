import { renderProductCopy } from "@/lib/product-copy.mjs";
import styles from "./product-copy.module.css";
export function ProductCopy({text}: {text?: string | null}) {
  return <div className={styles.copy} dangerouslySetInnerHTML={{__html: renderProductCopy(text)}} />;
}
