import { AccountOrderDetailClient } from "@/components/account/account-order-detail-client";

export const dynamic = "force-dynamic";

export default async function AccountOrderDetailPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  return <AccountOrderDetailClient orderNumber={decodeURIComponent(orderNumber)} />;
}
