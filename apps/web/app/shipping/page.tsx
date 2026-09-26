import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description: "HIDI shipping information for India, including delivery availability, tracking and complimentary-shipping guidance.",
  alternates: { canonical: "/shipping" },
};
import Link from "next/link";
import styles from "@/components/policy-page.module.css";

const shippingFaqs = [
  {
    q: "What is the shipping policy within India?",
    a: "HIDI currently ships orders within India. Delivery availability is confirmed using the shipping address provided at checkout."
  },
  {
    q: "Can I reschedule my delivery?",
    a: "Delivery rescheduling depends on the courier partner and shipment status. Once tracking is available, use the courier's options where supported or contact HIDI support for help."
  },
  {
    q: "What is the shipping turnaround time?",
    a: "Estimated delivery timelines will be shown before go-live once courier service levels are finalized. During testing, delivery dates should be treated as indicative rather than guaranteed."
  },
  {
    q: "Do you offer free shipping on orders?",
    a: "Yes. Complimentary shipping applies to orders above ₹1,499. Any shipping charge below that threshold will be shown clearly before payment."
  },
  {
    q: "What if my order is delayed?",
    a: "If a shipment is delayed beyond the courier's expected delivery window, HIDI support can help review the tracking status and raise a follow-up with the delivery partner where required."
  },
  {
    q: "What are the shipping charges?",
    a: "Orders above ₹1,499 qualify for complimentary shipping. Charges for lower-value orders will be displayed at checkout before payment."
  },
  {
    q: "Is there a limit for COD orders?",
    a: "Cash on Delivery limits have not yet been finalized for HIDI. If COD is enabled for launch, eligibility and any applicable limits will be shown at checkout."
  },
  {
    q: "Can I track my order?",
    a: "Yes. Once an order is dispatched and tracking is generated, the tracking reference will be made available through the customer's order updates."
  },
  {
    q: "Can I change the shipping address of the order?",
    a: "Address changes may be possible only before dispatch. Once the shipment has been handed to the courier, changes may no longer be possible."
  },
  {
    q: "Do you ship internationally?",
    a: "International shipping is not part of the current HIDI launch scope. The website is currently being prepared for domestic delivery within India."
  }
];

export default function ShippingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.breadcrumbs}><Link href="/">Home</Link> / Shipping Policy</div>
      <header className={styles.header}>
        <p className={styles.eyebrow}>HIDI HELP</p>
        <h1>Shipping Policy</h1>
        <p>Everything you need to know about delivery, shipping charges and order tracking.</p>
      </header>

      <div className={styles.list}>
        {shippingFaqs.map((item) => (
          <details className={styles.item} key={item.q}>
            <summary><span>{item.q}</span><span className={styles.plus} aria-hidden="true" /></summary>
            <div className={styles.answer}><p>{item.a}</p></div>
          </details>
        ))}
      </div>

      <p className={styles.footerNote}>Shipping timelines, courier coverage and COD rules may be refined before production launch. Any final charges or restrictions will be shown before payment.</p>
    </main>
  );
}
