import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/policy-page.module.css";
export const metadata: Metadata = { title: "Contact & Help", description: "Help with HIDI orders, delivery, sizing and aftercare.", alternates: { canonical: "/contact" } };
export default function ContactPage() {
  return <div className={styles.page}>
    <div className={styles.breadcrumbs}><a href="/">Home</a> / Contact &amp; Help</div>
    <header className={styles.header}><p className={styles.eyebrow}>HIDI HELP</p><h1>How can we help?</h1><p>Your order, your fit, your next step.</p></header>
    <div className={styles.helpGrid}>
      <section className={styles.notice}><h2>Your orders</h2><p>Sign in using the details linked to your order to view available tracking and item-level aftercare actions.</p><Link href="/account/orders">View my orders →</Link></section>
      <section className={styles.notice}><h2>Size &amp; product details</h2><p>Open a product’s Size &amp; fit guide. Measurements, when published, describe the finished garment rather than your body.</p><Link href="/collections/all">Find your piece →</Link></section>
      <section className={styles.notice}><h2>Delivery</h2><p>Check PIN-code availability on the product page and review shipping guidance.</p><Link href="/shipping">Delivery &amp; tracking →</Link></section>
      <section className={styles.notice}><h2>Returns &amp; exchanges</h2><p>Read eligibility before choosing a piece, and review the available actions on your order.</p><Link href="/returns">Aftercare guidance →</Link></section>
    </div>
    <section className={styles.notice} aria-label="Contact HIDI"><h2>Talk to HIDI</h2>
      <p><strong>WhatsApp:</strong> <a href="https://wa.me/917093709353" target="_blank" rel="noopener noreferrer">+91 70937 09353</a></p>
      <p><strong>Mobile:</strong> <a href="tel:+917093709353">+91 70937 09353</a></p>
      <p><strong>Email:</strong> <a href="mailto:Contact@hidiindia.com">Contact@hidiindia.com</a></p>
      <address style={{ fontStyle: "normal", lineHeight: 1.6 }}><strong>Contact Address:</strong><br />
        Flat No. 704, Hyma Arcade<br />
        Khanamet, Ayyappa Society, Madhapur<br />
        Hyderabad, Telangana – 500081<br />
        India
      </address>
      <p>For an order enquiry, keep your order number and the affected item or size ready. Do not share card details, passwords or payment OTPs.</p>
    </section>
    <section className={styles.notice} id="payments"><h2>Payment guidance</h2><p>Review the final order total before proceeding to the checkout payment provider. A payment or courier journey is not confirmed by browsing this preview.</p><Link href="/cart">Review your shopping bag →</Link></section>
  </div>;
}
