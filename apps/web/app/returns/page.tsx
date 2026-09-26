import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Returns",
  description: "HIDI return guidance covering eligibility, pickup, damaged items and the 7-day return window.",
  alternates: { canonical: "/returns" },
};
import Link from "next/link";
import styles from "@/components/policy-page.module.css";

const returnFaqs = [
  {
    q: "How do I initiate a return?",
    a: "For the current HIDI test phase, return initiation is not yet automated. Before go-live, customers will be able to start a return from their order history or contact HIDI support with the order number."
  },
  {
    q: "Within how many days can I return a product?",
    a: "Eligible items can be returned within 7 days of delivery. The item must meet the return conditions shown below."
  },
  {
    q: "What are the eligibility criteria for returns?",
    a: "Returned items should be unused, unworn and in their original condition with tags and packaging intact. Items showing signs of wear, washing, alteration or damage after delivery may not be accepted."
  },
  {
    q: "How will my return be picked up?",
    a: "Where reverse pickup is available, HIDI will arrange collection through a courier partner. If a pickup is not serviceable at the delivery PIN code, support will provide the available return option."
  },
  {
    q: "Can I return products purchased from other websites or stores?",
    a: "No. HIDI can process returns only for orders placed directly through the HIDI store and associated with a valid HIDI order number."
  },
  {
    q: "What if I hand over the wrong product during pickup?",
    a: "Please make sure the correct HIDI item is handed to the courier. A return can only be approved after the received item is matched to the original order."
  },
  {
    q: "How will I know if my return has been received and approved?",
    a: "Once the returned item is received and inspected, the return status will be updated and the customer will be informed through the available order communication channel."
  },
  {
    q: "Can I exchange a product?",
    a: "A direct exchange workflow has not yet been finalized. If exchanges are enabled before launch, size or product exchange eligibility will be shown in the return flow. Otherwise, customers can return an eligible item and place a new order."
  },
  {
    q: "What should I do if I receive a wrong or missing item?",
    a: "Contact HIDI support as soon as possible with your order number and clear photos of the parcel and received item. Genuine fulfilment errors will be reviewed separately from standard preference-based returns."
  },
  {
    q: "Will I be charged for returning a wrong or damaged product?",
    a: "For a verified wrong or damaged item supplied by HIDI, the customer should not bear the standard return cost. Other return charges, if any, will be disclosed in the final production policy before launch."
  },
  {
    q: "What happens if the pickup attempt fails?",
    a: "If a scheduled pickup fails, the courier may attempt again or HIDI support can help arrange the next available option depending on serviceability."
  }
];

export default function ReturnsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.breadcrumbs}><Link href="/">Home</Link> / Returns</div>
      <header className={styles.header}>
        <p className={styles.eyebrow}>HIDI HELP</p>
        <h1>Returns</h1>
        <p>A clear guide to eligibility, pickup, damaged items and the 7-day return window.</p>
      </header>

      <div className={styles.notice}>
        <strong>Return window:</strong> Eligible items may be returned within 7 days of delivery. Final return charges and exchange rules will be confirmed before production launch.
      </div>

      <div className={styles.list}>
        {returnFaqs.map((item) => (
          <details className={styles.item} key={item.q}>
            <summary><span>{item.q}</span><span className={styles.plus} aria-hidden="true" /></summary>
            <div className={styles.answer}><p>{item.a}</p></div>
          </details>
        ))}
      </div>

      <p className={styles.footerNote}>Offer orders, promotional items and final-sale exclusions should follow the specific terms displayed with that offer. Genuine wrong or damaged-item cases are handled separately from normal returns.</p>
    </main>
  );
}
