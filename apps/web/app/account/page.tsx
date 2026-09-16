import { AccountOrdersClient } from "@/components/account-orders-client";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <main className="container collection-page">
      <header className="collection-header compact">
        <p className="eyebrow">ACCOUNT</p>
        <h1>My HIDI.</h1>
        <p>Sign in securely with an email one-time code to see your HIDI orders across devices.</p>
      </header>
      <AccountOrdersClient />
    </main>
  );
}
