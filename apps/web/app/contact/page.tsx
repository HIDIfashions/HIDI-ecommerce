import type { Metadata } from "next";
import Link from "next/link";
import { configuredWhatsAppNumber } from "@/lib/product-sharing";
import styles from "@/components/policy-page.module.css";

export const metadata: Metadata = {
  title: "Contact & Help",
  description: "Find help with HIDI orders, delivery, returns and exchanges.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const phone = configuredWhatsAppNumber();
  return <main className={styles.page}>
    <div className={styles.breadcrumbs}><Link href="/">Home</Link> / Contact &amp; Help</div>
    <header className={styles.header}>
      <p className={styles.eyebrow}>HIDI HELP</p>
      <h1>How can we help?</h1>
      <p>Find information about your order, delivery and aftercare.</p>
    </header>
    <section className={styles.notice} aria-label="Order help">
      <h2>Your orders</h2>
      <p>Sign in to see your order details and available tracking updates.</p>
      <Link href="/account/orders">View my orders</Link>
    </section>
    <section className={styles.notice} aria-label="Delivery and returns help">
      <h2>Delivery, returns and exchanges</h2>
      <p><Link href="/shipping">Read our shipping policy</Link></p>
      <p><Link href="/returns">Read our returns and exchanges policy</Link></p>
    </section>
    {phone ? <section className={styles.notice} aria-label="Contact HIDI">
      <h2>Talk to HIDI</h2>
      <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">Contact us on WhatsApp</a>
    </section> : <p className={styles.footerNote}>Direct contact details will be available when the store opens.</p>}
  </main>;
}
