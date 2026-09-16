import { AdminOrderDetailClient } from "./admin-order-detail-client";

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  return <AdminOrderDetailClient orderNumber={orderNumber} />;
}
