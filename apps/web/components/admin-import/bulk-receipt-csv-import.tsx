"use client";
import { useRef, useState } from "react";
import { downloadCsv, makeCsv, readSpreadsheet } from "@/lib/hidi-spreadsheet";
import { normalizeReceiptRows, skuKey } from "@/lib/hidi-bulk-import";
import type { InventoryRowLite, ReceiptCsvRow } from "@/lib/hidi-bulk-import";
import styles from "./bulk-import.module.css";

export type ReceiptImportLine = { sku: string; acceptedQuantity: string; rejectedQuantity: string; unitCostRupees: string };

const RECEIPT_HEADERS = ["sku", "accepted_qty", "rejected_qty", "unit_cost"];
const RECEIPT_SAMPLE = [["HIDI-SAMPLE-SKU-M", 10, 0, "825.00"], ["HIDI-SAMPLE-SKU-L", 8, 1, "825.00"]];

export function BulkReceiptCsvImport({ variants, disabled, onRows }: {
  variants: InventoryRowLite[];
  disabled?: boolean;
  onRows: (rows: ReceiptImportLine[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ReceiptCsvRow[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function choose(file?: File) {
    if (!file) return;
    setError(null); setPreview([]); setName(file.name);
    try {
      const rows = normalizeReceiptRows(await readSpreadsheet(file));
      const known = new Set(variants.map(v => skuKey(v.sku)));
      rows.forEach(row => { if (row.sku && !known.has(skuKey(row.sku))) row.errors.push("SKU is not in current HIDI inventory. Create the product/SKU first."); });
      setPreview(rows);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to read receipt spreadsheet."); }
  }
  const invalid = preview.filter(row => row.errors.length).length;
  return <section className={styles.inlineImport}>
    <div><strong>Bulk receipt lines</strong><small>Excel/CSV → SKU, accepted qty, rejected qty and unit cost. This prepares the receipt; stock still changes only when you press Post receipt.</small></div>
    <div className={styles.inlineButtons}>
      <button type="button" disabled={disabled} onClick={() => downloadCsv("HIDI-receipt-import-template.csv", makeCsv(RECEIPT_HEADERS, RECEIPT_SAMPLE))}>Download template</button>
      <button type="button" disabled={disabled} onClick={() => input.current?.click()}>Import receipt file</button>
      <input ref={input} className={styles.hiddenInput} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={disabled} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void choose(file); }} />
    </div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {preview.length > 0 && <div className={styles.inlinePreview}>
      <p><strong>{name}</strong> · {preview.length} rows · {invalid ? `${invalid} need attention` : "ready to add"}</p>
      {invalid > 0 ? <ul>{preview.filter(row => row.errors.length).slice(0, 6).map(row => <li key={row.rowNumber}>Row {row.rowNumber}: {row.errors.join(" ")}</li>)}</ul>
        : <button type="button" disabled={disabled} className={styles.primary} onClick={() => { onRows(preview.map(row => ({ sku: row.sku, acceptedQuantity: row.acceptedQuantity, rejectedQuantity: row.rejectedQuantity, unitCostRupees: row.unitCostRupees }))); setPreview([]); setName(""); }}>Add {preview.length} lines to this receipt</button>}
      <button type="button" disabled={disabled} onClick={() => { setPreview([]); setName(""); setError(null); }}>Cancel import</button>
    </div>}
  </section>;
}
