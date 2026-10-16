import { WalletBalance } from "@/components/wallet-balance";
import styles from "./rewards.module.css";

export const dynamic = "force-dynamic";

export default function RewardsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className="eyebrow">HIDI REWARDS</p>
        <h1>Thoughtful shopping, rewarded.</h1>
        <p>Your available balance, pending rewards and wallet activity live here.</p>
      </header>
      <WalletBalance />
    </main>
  );
}
