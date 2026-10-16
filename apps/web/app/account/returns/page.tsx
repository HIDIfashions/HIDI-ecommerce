import { AccountAftercareClient } from "@/components/account/account-aftercare-client";
import styles from "./returns.module.css";

export const dynamic = "force-dynamic";

export default function AccountReturnsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className="eyebrow">HIDI AFTERCARE</p>
        <h1>Returns, exchanges & refunds — clearly tracked.</h1>
        <p>See each request as its own journey, from pickup through refund or replacement.</p>
      </header>

      <AccountAftercareClient />
    </main>
  );
}
