import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/policy-page.module.css";
export const metadata: Metadata = { title: "Contact & Help", description: "Help with HIDI orders, delivery, sizing and aftercare.", alternates: { canonical: "/contact" } };
const contactIconPaths = {"whatsapp": ["M3 21l1.65-3.8a9 9 0 1 1 3.15 3.15L3 21", "M9 8h1l1 3-1 1a6 6 0 0 0 2 2l1-1 3 1v1a1 1 0 0 1-1 1 8 8 0 0 1-7-7 1 1 0 0 1 1-1Z"], "phone": ["M5 4h4l2 5-2 1.5a11 11 0 0 0 4.5 4.5L15 13l5 2v4a1 1 0 0 1-1 1C10.7 20 4 13.3 4 5a1 1 0 0 1 1-1Z"], "email": ["M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z", "m3 7 9 6 9-6"], "address": ["M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z", "M15 10a3 3 0 1 1-6 0a3 3 0 0 1 6 0Z"]} as const;
function ContactIcon({ kind }: { kind: keyof typeof contactIconPaths }) {
  return <svg data-hidi-contact-icon={kind} aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 8, flexShrink: 0 }}>
    {contactIconPaths[kind].map(path => <path key={path} d={path} />)}
  </svg>;
}

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
      <p><strong><ContactIcon kind="whatsapp" />WhatsApp:</strong> <a href="https://wa.me/917093709353" target="_blank" rel="noopener noreferrer">+91 70937 09353</a></p>
      <p><strong><ContactIcon kind="phone" />Mobile:</strong> <a href="tel:+917093709353">+91 70937 09353</a></p>
      <p><strong><ContactIcon kind="email" />Email:</strong> <a href="mailto:Contact@hidiindia.com">Contact@hidiindia.com</a></p>
      <address style={{ fontStyle: "normal", lineHeight: 1.6 }}><strong><ContactIcon kind="address" />Contact Address:</strong><br />
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
