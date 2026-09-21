import { OrderBarcodeLabel } from "@/components/admin/order-barcode-label";
import styles from "./order-label.module.css";

export const dynamic = "force-dynamic";

export default async function OrderLabelPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const decoded = decodeURIComponent(orderNumber);

  return (
    <main className={styles.page}>
      <section className={styles.toolbar}>
        <p>HIDI ORDER LABEL</p>
        <h1>{decoded}</h1>
        <span>Generated automatically from the confirmed order number.</span>
      </section>

      <section className={styles.sheet}>
        <OrderBarcodeLabel orderNumber={decoded} className={styles.label} />
      </section>

      <script
        dangerouslySetInnerHTML={{
          __html: "window.addEventListener('load',()=>setTimeout(()=>window.print(),150));",
        }}
      />
    </main>
  );
}
