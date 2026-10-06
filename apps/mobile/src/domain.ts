import { mediaUrl } from "./config";

export type ProductImage = { id: string; url: string; alt?: string | null; position?: number };
export type Variant = {
  id: string; sku: string; size: string; color: string; colorHex?: string | null;
  mrpPaise: number; pricePaise: number; available: number; images?: ProductImage[];
  bustMm?: number | null; waistMm?: number | null; hipMm?: number | null; garmentLengthMm?: number | null;
};
export type Product = {
  id: string; slug: string; name: string; brand?: string | null; shortDescription?: string | null;
  description?: string | null; fabric?: string | null; care?: string | null;
  category?: { id: string; name: string; slug: string } | null;
  collections: Array<{ id: string; name: string; slug: string }>;
  images: ProductImage[]; variants: Variant[]; minPricePaise: number; maxPricePaise: number;
  inStock: boolean; averageRating?: number; reviewCount?: number;
};
export type CartLine = {
  id: string; quantity: number; unitPricePaise: number; lineTotalPaise: number;
  product: { id: string; slug: string; name: string; image?: string | null };
  variant: { id: string; sku?: string; size: string; color: string; available: number };
};
export type Cart = { id: string | null; sessionId: string; currency: string; items: CartLine[]; itemCount: number; subtotalPaise: number };
export type Address = { id: string; name: string; phone: string; line1: string; line2?: string; city: string; state: string; pin: string; isDefault?: boolean };
export type AuthSession = { access_token: string; refresh_token?: string; expires_at?: number; user: { id: string; phone?: string; email?: string; user_metadata?: Record<string, unknown> } };
export type Campaign = { id: string; title: string; subtitle?: string; endsAt: string; image?: string; collectionSlug?: string };
export type InsiderSummary = { tier: "GUEST" | "MEMBER" | "SILVER" | "GOLD"; points: number; freeShippingThresholdPaise?: number; earlyAccess?: boolean };

export function money(paise: number) {
  if (!Number.isSafeInteger(paise)) return "₹—";
  const fraction = Math.abs(paise) % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: fraction, maximumFractionDigits: fraction }).format(paise / 100);
}
export function primaryImage(product: Product) {
  return mediaUrl(product.images?.[0]?.url ?? product.variants.flatMap(v => v.images ?? [])[0]?.url);
}
export function discountPercent(product: Product) {
  const prices = product.variants.filter(v => v.mrpPaise > v.pricePaise && v.pricePaise > 0);
  if (!prices.length) return 0;
  return Math.max(...prices.map(v => Math.round(((v.mrpPaise - v.pricePaise) / v.mrpPaise) * 100)));
}
export function productMrp(product: Product) {
  const mrps = product.variants.map(v => v.mrpPaise).filter(v => Number.isSafeInteger(v) && v > 0);
  return mrps.length ? Math.min(...mrps) : product.minPricePaise;
}
