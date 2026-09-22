"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Code128Barcode } from "@/components/admin/code128-barcode";
import styles from "./receipt-labels.module.css";

type ReceiptLine = {
  id: string;
  acceptedQuantity: number;
  stockLots: Array<{
    lotCode: string;
    acceptedQuantity: number;
  }>;
  variant: {
    sku: string;
    size: string;
    color: string;
    mrpPaise: number;
    pricePaise: number;
    product: { name: string };
  };
};

type Receipt = {
  id: string;
  receiptNumber: string;
  supplierName: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  totalAccepted: number;
  receivedAt: string;
  lines: ReceiptLine[];
};

export function ReceiptPriceTagLabelsClient({ receiptId }: { receiptId: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/inventory/receipts/" + encodeURIComponent(receiptId), { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.message ?? "Unable to load stock receipt");
        const found = body as Receipt;
        if (found.status !== "POSTED") throw new Error("Price-tag barcodes are available only after the receipt is posted");
        if (active) setReceipt(found);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load labels");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [receiptId]);

  const labels = useMemo(() => {
    if (!receipt) return [];
    return receipt.lines.flatMap((line) => {
      const lot = line.stockLots?.[0];
      if (!lot) return [];
      return Array.from({ length: Math.max(0, lot.acceptedQuantity ?? 0) }, (_, index) => ({
        key: line.id + "-" + index,
        sku: line.variant.sku,
        lotCode: lot.lotCode,
        productName: line.variant.product.name,
        color: line.variant.color,
        size: line.variant.size,
        mrpPaise: line.variant.mrpPaise,
        pricePaise: line.variant.pricePaise,
        value: "HIDI-SKU:" + line.variant.sku + "|LOT:" + lot.lotCode,
      }));
    });
  }, [receipt]);

  if (loading) {
    return <main className={styles.state}>Preparing price-tag barcodes…</main>;
  }

  if (error || !receipt) {
    return (
      <main className={styles.state}>
        <strong>{error ?? "Unable to prepare labels"}</strong>
        <Link href="/admin/inventory/receive">Back to receiving</Link>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.toolbar}>
        <div>
          <p>HIDI INVENTORY · PRICE-TAG BARCODES</p>
          <h1>{receipt.receiptNumber}</h1>
          <span>
            {receipt.totalAccepted} accepted piece{receipt.totalAccepted === 1 ? "" : "s"} · {receipt.supplierName}
          </span>
        </div>
        <div className={styles.actions}>
          <Link href="/admin/inventory/receive">Back to receiving</Link>
          <button type="button" onClick={() => window.print()}>Print all {labels.length}</button>
        </div>
      </header>

      <section className={styles.instructions}>
        <strong>Attach one label to the price tag of each accepted garment.</strong>
        <span>
          Repeat purchases reuse the same HIDI SKU but receive a new lot code. The lot on this tag links the packed garment back to this GRN and vendor invoice.
        </span>
      </section>

      <section className={styles.sheet}>
        {labels.map((label) => (
          <article className={styles.label} key={label.key}>
            <div className={styles.brandRow}>
              <strong>HIDI</strong>
              <span>PRICE TAG</span>
            </div>
            <Code128Barcode className={styles.barcode} value={label.value} height={46} />
            <code>{label.sku}</code>
            <small className={styles.lotCode}>{label.lotCode}</small>
            <b>{label.productName}</b>
            <small>{label.color} · Size {label.size}</small>
            <div className={styles.priceLine}>
              <span>₹{Math.round(label.pricePaise / 100).toLocaleString("en-IN")}</span>
              {label.mrpPaise > label.pricePaise && (
                <del>MRP ₹{Math.round(label.mrpPaise / 100).toLocaleString("en-IN")}</del>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
