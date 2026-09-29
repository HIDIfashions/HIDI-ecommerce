import type { Metadata } from "next";
import Link from "next/link";
import { SHIPPING_COPY, SHIPPING_TIMELINE } from "@/lib/shopping-guidance";
import styles from "@/components/policy-page.module.css";
export const metadata: Metadata = { title: "Shipping Policy", description: "HIDI delivery availability, shipping threshold and tracking guidance.", alternates: { canonical: "/shipping" } };
const questions = [
  { q: "Where is delivery available?", a: "The launch delivery scope is India. Check a six-digit PIN code on the product page; an availability result is not a guaranteed delivery date." },
  { q: "What are the shipping charges?", a: SHIPPING_COPY + " Review any charge for lower-value orders in the final checkout summary before payment." },
  { q: "When will my order arrive?", a: SHIPPING_TIMELINE },
  { q: "Where can I track an order?", a: "Open your order to view available shipment references and tracking updates. A reference appears only after it has been generated." },
  { q: "Can I change my address or reschedule delivery?", a: "Available changes depend on the shipment status and the courier. Do not assume an address can be changed once the parcel has been dispatched." },
  { q: "Is Cash on Delivery available?", a: "Cash on Delivery is not promised for launch. Only payment methods explicitly offered at checkout are available for that order." },
];
export default function ShippingPage() { return <div className={styles.page}>
  <div className={styles.breadcrumbs}><Link href="/">Home</Link> / Shipping Policy</div>
  <header className={styles.header}><p className={styles.eyebrow}>HIDI DELIVERY</p><h1>Shipping &amp; delivery</h1><p>Know the cost. Check availability. Follow your order.</p></header>
  <section className={styles.notice}><strong>{SHIPPING_COPY}</strong><p>{SHIPPING_TIMELINE}</p><Link href="/account/orders">View tracking on my order →</Link></section>
  <div className={styles.list}>{questions.map(({q,a}) => <details className={styles.item} key={q}><summary><span>{q}</span><span className={styles.plus} aria-hidden="true" /></summary><div className={styles.answer}><p>{a}</p></div></details>)}</div>
  <p className={styles.footerNote}><Link href="/contact">Order help</Link> · <Link href="/returns">Returns &amp; exchanges</Link></p>
</div>; }
