import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Bag",
  robots: { index: false, follow: false },
};

import { CartClient } from "@/components/cart-client";
export default function CartPage() { return <div className="container cart-page"><header className="collection-header compact"><p className="eyebrow">YOUR BAG</p><h1>Your HIDI edit.</h1></header><CartClient /></div>; }
