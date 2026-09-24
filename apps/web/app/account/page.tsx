import { AccountOrdersClient } from "@/components/account-orders-client";
import { WalletBalance } from "@/components/wallet-balance";
import styles from "./account.module.css";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <main className="container collection-page">
      <section className={styles.accountTop}>
        <header className={`collection-header compact ${styles.header}`}>
          <p className="eyebrow">ACCOUNT</p>
          <h1>My HIDI.</h1>
          <p>Sign in securely with your mobile number and a one-time code to see your HIDI orders, rewards and preferences across devices.</p>
        </header>

        <div className={styles.walletSlot}>
          <WalletBalance compact />
        </div>
      </section>

      <AccountOrdersClient />
    </main>
  );
}
