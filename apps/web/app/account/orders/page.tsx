import { AccountOrdersClient } from "@/components/account-orders-client";
import styles from "./orders.module.css";

export const dynamic = "force-dynamic";

export default function AccountOrdersPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className="eyebrow">ORDERS & WARDROBE</p>
        <h1>Your HIDI pieces.</h1>
        <p>Track every order, revisit each piece and manage aftercare without losing the story of your wardrobe.</p>
      </header>

      <AccountOrdersClient view="orders" />
    </main>
  );
}
