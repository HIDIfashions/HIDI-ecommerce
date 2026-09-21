import { ReceiptPriceTagLabelsClient } from "./receipt-price-tag-labels-client";

export const dynamic = "force-dynamic";

export default async function ReceiptPriceTagLabelsPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;
  return <ReceiptPriceTagLabelsClient receiptId={decodeURIComponent(receiptId)} />;
}
