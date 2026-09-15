import { AccountOrdersClient } from "@/components/account-orders-client";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <main className="container collection-page">
      <header className="collection-header compact">
        <p className="eyebrow">ACCOUNT</p>
        <h1>My orders.</h1>
        <p>Review orders placed from this browser. Customer sign-in can be added before go-live so order history follows you across devices.</p>
      </header>
      <AccountOrdersClient />
    </main>
  );
}
