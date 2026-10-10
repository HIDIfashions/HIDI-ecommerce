import type { Metadata } from "next";
import Link from "next/link";
import { LAUNCH_OFFER_COPY } from "@/lib/shopping-guidance";
import styles from "@/components/policy-page.module.css";
export const metadata: Metadata = { title: "HIDI Privileges", description: "Launch privilege details, eligibility status and offer conditions.", alternates: { canonical: "/offers" } };
export default function OffersPage() { return <div className={styles.page}>
  <div className={styles.breadcrumbs}><a href="/">Home</a> / HIDI Privileges</div>
  <header className={styles.header}><p className={styles.eyebrow}>HIDI PRIVILEGES</p><h1>A little more, with clear terms.</h1><p>Preview of planned launch benefits, not an active checkout entitlement.</p></header>
  <section className={styles.notice} id="rupee"><h2>The ₹1 HIDI Privilege</h2><p>Planned qualifying purchase: ₹3,999+ and one selected eligible style for ₹1.</p><p>{LAUNCH_OFFER_COPY}</p><p>The eligible styles, qualifying-subtotal calculation, availability and treatment of changed or returned orders must be finalized before this offer is enabled. Not every style in Shop All is eligible.</p></section>
  <section className={styles.notice} id="silver"><h2>A Little Silver</h2><p>A 2 g silver launch keepsake is planned. The qualifying order value, allocation count and fulfilment conditions are not yet confirmed here. Do not place an order expecting a silver gift unless the offer is explicitly confirmed for it.</p></section>
  <section className={styles.notice} id="rewards"><h2>HIDI Rewards</h2><p>Rewards and refund credit are different. Review your actual available wallet balance and the reward conditions on your account; a pending reward is not yet spendable.</p><Link href="/account/rewards">View my rewards →</Link></section>
  <p className={styles.footerNote}>Final approved terms and checkout calculations must agree before these promotional offers are opened. <Link href="/returns">Read aftercare guidance.</Link></p>
</div>; }
