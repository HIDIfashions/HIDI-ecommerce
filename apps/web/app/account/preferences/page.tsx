import { RetentionPreferences } from "@/components/retention-preferences";
import styles from "./preferences.module.css";

export const dynamic = "force-dynamic";

export default function PreferencesPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className="eyebrow">PREFERENCES</p>
        <h1>How HIDI stays in touch.</h1>
        <p>Choose the updates that are useful to you. Keep the rest quiet.</p>
      </header>
      <RetentionPreferences />
    </main>
  );
}
