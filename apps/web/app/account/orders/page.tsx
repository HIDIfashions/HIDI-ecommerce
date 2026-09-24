import { AccountOrdersClient } from "@/components/account-orders-client";

export const dynamic = "force-dynamic";

export default function OrdersPage() {
  return <AccountOrdersClient view="orders" />;
}
