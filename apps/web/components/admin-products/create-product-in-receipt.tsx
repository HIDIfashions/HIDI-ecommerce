"use client";
import { useEffect, useRef, useState } from "react";
import type { ReceiveVariant } from "@/lib/admin-products-contract";
import { ProductEditor } from "./product-editor";
import styles from "./products.module.css";

export function CreateProductInReceipt({ disabled = false, onVariants }: { disabled?: boolean; onVariants: (variants: ReceiveVariant[]) => void }) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) { dialog.current.close(); trigger.current?.focus(); }
  }, [open]);
  function close() {
    if (busy) return;
    if (dirty && !window.confirm("Discard unsaved product edits? Your current receipt will stay intact. Any already-saved product draft remains in Products.")) return;
    setOpen(false); setDirty(false);
  }
  return <div className={styles.createShortcut}>
    <button ref={trigger} type="button" className={styles.shortcutButton} disabled={disabled} onClick={() => { setDirty(false); setBusy(false); setOpen(true); }}>+ Create new product</button>
    <small>New design from your manufacturer? Create its SKUs without leaving this receipt.</small>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="hidi-create-product-title" onCancel={event => { event.preventDefault(); close(); }}>
      <header className={styles.dialogHeader}><div><strong id="hidi-create-product-title">Create product · continue receiving</strong><small>Your current receipt stays open underneath.</small></div><button type="button" disabled={busy} onClick={close} aria-label="Close product editor">Close ×</button></header>
      <div className={styles.dialogBody}>{open && <ProductEditor onDirtyChange={setDirty} onBusyChange={setBusy} onUse={variants => { onVariants(variants); setOpen(false); setDirty(false); }} />}</div>
    </dialog>
  </div>;
}
