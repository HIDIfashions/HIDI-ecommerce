"use client";

import Link from "next/link";
import { useAdminData } from "@/components/admin/admin-client";
import styles from "../orders/[orderNumber]/order-detail.module.css";

type QueueItem = { id: string; orderNumber: string; kind: string; text: string; actorName: string; type?: string; dueAt?: string; status?: string };
export default function SupportQueuePage() {
  const { data, loading, error, reload } = useAdminData<{ items: QueueItem[] }>("/api/admin/support");
  return <main className={styles.page}>
    <h1>Support follow-ups and approvals</h1>
    <p>Open follow-ups and requests awaiting an Owner decision. Open an order to update its support history or review a request.</p>
    <button type="button" onClick={reload}>Refresh</button>
    {loading && <p>Loading support queue…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {data && data.items.length === 0 && <p>No open follow-ups or pending approvals.</p>}
    {data?.items.map(item => <article className={styles.card} key={item.id}>
      <h2><Link href={`/admin/orders/${encodeURIComponent(item.orderNumber)}`}>{item.orderNumber}</Link></h2>
      <strong>{item.kind === "APPROVAL_REQUEST" ? `Pending Owner approval · ${item.type?.replaceAll("_", " ")}` : item.status?.replaceAll("_", " ")}</strong>
      <p style={{ whiteSpace: "pre-wrap" }}>{item.text}</p>
      {item.dueAt && <p>{Date.parse(item.dueAt) < Date.now() ? "Overdue" : "Due"}: {new Date(item.dueAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>}
      <small>Recorded by {item.actorName}</small>
    </article>)}
  </main>;
}
