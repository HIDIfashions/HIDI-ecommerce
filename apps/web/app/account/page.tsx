import { AccountOrdersClient } from "@/components/account-orders-client";
import { AccountWalletGate } from "@/components/account/account-wallet-gate";
import styles from "./account.module.css";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <main className={styles.page}>
      <section className={styles.accountTop}>
        <header className={`collection-header compact ${styles.header}`}>
          <p className="eyebrow">ACCOUNT</p>
          <h1>My HIDI.</h1>
          <p>Your wardrobe, aftercare and rewards in one calm place.</p>
        </header>

        <div className={styles.walletSlot}>
          <AccountWalletGate />
        </div>
      </section>

      <AccountOrdersClient view="overview" />
    </main>
  );
}
