import { resolveHidiMediaUrl } from "../network/config";

export type ApiImage = {
  id: string;
  url: string;
  alt?: string | null;
  position: number;
};

export type ApiVariant = {
  id: string;
  sku: string;
  size: string;
  color: string;
  colorHex?: string | null;
  mrpPaise: number;
  pricePaise: number;
  available: number;
  bustMm?: number | null;
  waistMm?: number | null;
  hipMm?: number | null;
  shoulderMm?: number | null;
  sleeveLengthMm?: number | null;
  garmentLengthMm?: number | null;
  images?: ApiImage[];
};

export type ApiProduct = {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string | null;
  description?: string | null;
  fabric?: string | null;
  care?: string | null;
  category?: { id: string; name: string; slug: string } | null;
  collections: { id: string; name: string; slug: string }[];
  images: ApiImage[];
  variants: ApiVariant[];
  minPricePaise: number;
  maxPricePaise: number;
  inStock: boolean;
  averageRating?: number;
  reviewCount?: number;
};

export function productImage(product: ApiProduct) {
  const raw = product.images?.[0]?.url || product.variants.flatMap((variant) => variant.images ?? [])[0]?.url || "";
  return resolveHidiMediaUrl(raw);
}

export function formatINRPaise(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value / 100);
}
