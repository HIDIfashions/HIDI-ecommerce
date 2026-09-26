import type { Metadata } from "next";
import { CheckoutClient } from "@/components/checkout-client";

export const metadata: Metadata = {
  title: "Secure Checkout",
  robots: { index: false, follow: false },
};
export default function CheckoutPage() { return <div className="container checkout-page"><header className="collection-header compact"><p className="eyebrow">SECURE CHECKOUT</p><h1>Almost yours.</h1></header><CheckoutClient /></div>; }
