import type { Metadata } from "next";
import { OrderConfirmationClient } from "@/components/order-confirmation-client";

export const metadata: Metadata = {
  title: "Order Confirmation",
  robots: { index: false, follow: false },
};

export default async function OrderConfirmed({ searchParams }: { searchParams: Promise<{ order?: string; status?: string }> }) {
  const { order, status } = await searchParams;

  if (!order) {
    return <div className="container confirmation-page">
      <p className="eyebrow">ORDER CONFIRMATION</p>
      <h1>We couldn’t find that order.</h1>
      <p>Please return to the store and check your order confirmation link.</p>
    </div>;
  }

  return <OrderConfirmationClient orderNumber={order} initialStatus={status} />;
}
