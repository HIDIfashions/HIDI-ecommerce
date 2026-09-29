import type { Metadata } from "next";
import Link from "next/link";
import { RETURN_COPY, EXCHANGE_COPY, REFUND_TIMELINE } from "@/lib/shopping-guidance";
import styles from "@/components/policy-page.module.css";
export const metadata: Metadata = { title: "Returns & Exchanges", description: "HIDI return eligibility, order-level aftercare and exchange guidance.", alternates: { canonical: "/returns" } };
const questions = [
  { q: "How do I start a request?", a: "Open your order using the details linked to it, choose the affected item and check the return or exchange actions available for that item. Order status and eligibility determine which actions are offered." },
  { q: "What is the return window?", a: RETURN_COPY },
  { q: "What condition should my item be in?", a: "Keep the item unused, unworn and unwashed, with its original tags and packaging. The returned item is inspected before approval." },
  { q: "Can I exchange a size?", a: EXCHANGE_COPY + " A technical exchange option is not a promise that every item or PIN code is eligible." },
  { q: "What happens with a wrong, damaged or missing item?", a: "Keep the packaging, order number and clear photos of the received items. Such fulfilment issues must be reviewed separately from a preference-based return." },
  { q: "What are the pickup charges and refund timings?", a: REFUND_TIMELINE + " The final terms must be published before the store accepts orders; no free pickup or instant refund is promised here." },
  { q: "Can I return a promotional item?", a: "Promotional items have their own eligibility conditions. Read the specific offer before purchase; wrong or damaged-item cases are handled separately from ordinary preference returns." },
];
export default function ReturnsPage() { return <div className={styles.page}>
  <div className={styles.breadcrumbs}><Link href="/">Home</Link> / Returns &amp; Exchanges</div>
  <header className={styles.header}><p className={styles.eyebrow}>HIDI AFTERCARE</p><h1>Returns &amp; exchanges</h1><p>Clear information before you choose. A next step after delivery.</p></header>
  <section className={styles.notice}><strong>Return window:</strong> {RETURN_COPY}<p>Final exchange charges, pickup conditions and refund timelines remain launch prerequisites.</p><Link href="/account/orders">Open my orders →</Link></section>
  <div className={styles.list}>{questions.map(({q,a}) => <details className={styles.item} key={q}><summary><span>{q}</span><span className={styles.plus} aria-hidden="true" /></summary><div className={styles.answer}><p>{a}</p></div></details>)}</div>
  <p className={styles.footerNote}><Link href="/contact">Order help</Link> · <Link href="/offers">Offer conditions</Link> · <Link href="/shipping">Delivery guidance</Link></p>
</div>; }
