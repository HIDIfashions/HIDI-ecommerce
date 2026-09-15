import Link from "next/link";

export default async function OrderConfirmed({ searchParams }: { searchParams: Promise<{ order?: string; status?: string }> }) {
  const { order, status } = await searchParams;
  const pendingReview = status === "PAYMENT_REVIEW" || status === "authorized";
  return <div className="container confirmation-page">
    <p className="eyebrow">{pendingReview ? "PAYMENT RECEIVED" : "ORDER CONFIRMED"}</p>
    <h1>{pendingReview ? "We’re confirming the final details." : "It’s yours."}</h1>
    <p>{pendingReview ? "Your payment is safe. Our system is completing the confirmation; please do not pay again." : "Thank you for choosing HIDI. We’ll keep you updated as your order moves from our team to your door."}</p>
    {order && <div className="confirmation-number"><span>Order number</span><strong>{order}</strong></div>}
    <Link className="button button-dark" href="/collections/new-arrivals">Continue browsing</Link>
  </div>;
}
