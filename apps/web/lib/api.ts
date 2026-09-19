export const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

export type ApiVariant = {
  id: string;
  sku: string;
  size: string;
  color: string;
  colorHex?: string | null;
  mrpPaise: number;
  pricePaise: number;
  available: number;
  images?: { id: string; url: string; alt: string; position: number }[];
};

export type ApiProductReview = {
  id: string;
  rating: number;
  title?: string | null;
  body: string;
  reviewerName: string;
  verifiedPurchase: boolean;
  createdAt: string;
};

export type ApiProductReviews = {
  averageRating: number;
  reviewCount: number;
  reviews: ApiProductReview[];
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
  images: { id: string; url: string; alt: string; position: number }[];
  variants: ApiVariant[];
  minPricePaise: number;
  maxPricePaise: number;
  inStock: boolean;
  soldQuantity?: number;
};

async function fetchPublicList(url: URL | string): Promise<ApiProduct[]> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return [];
    return response.json();
  } catch (error) {
    // The API can briefly be unavailable while the Nest watcher restarts in
    // local/Codespaces development. Public catalogue pages should render an
    // empty/fallback state instead of turning the entire Next page into a 500.
    console.error("[HIDI catalogue] API unavailable:", error);
    return [];
  }
}

export async function getProducts(category?: string): Promise<ApiProduct[]> {
  const url = new URL(`${API_URL}/products`);
  if (category) url.searchParams.set("category", category);
  return fetchPublicList(url);
}

export async function getBestSellers(limit = 8): Promise<ApiProduct[]> {
  const url = new URL(`${API_URL}/products/best-sellers`);
  url.searchParams.set("limit", String(limit));
  return fetchPublicList(url);
}

export async function getRelatedProducts(slug: string, limit = 4): Promise<ApiProduct[]> {
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 8) : 4;
  const url = new URL(`${API_URL}/products/${encodeURIComponent(slug)}/related`);
  url.searchParams.set("limit", String(safeLimit));

  const related = await fetchPublicList(url);
  if (related.length > 0) return related.slice(0, safeLimit);

  // Keep the PDP recommendation section visible even if the dedicated related
  // endpoint is temporarily unavailable or the current product has no direct
  // category/collection matches.
  const catalogue = await getProducts();
  return catalogue
    .filter((product) => product.slug !== slug)
    .slice(0, safeLimit);
}

export async function getProduct(slug: string): Promise<ApiProduct | null> {
  const response = await fetch(`${API_URL}/products/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Unable to load HIDI product");
  return response.json();
}

export async function getProductReviews(productId: string): Promise<ApiProductReviews> {
  const response = await fetch(`${API_URL}/reviews/products/${encodeURIComponent(productId)}`, { cache: "no-store" });
  if (!response.ok) return { averageRating: 0, reviewCount: 0, reviews: [] };
  return response.json();
}

export function formatPaise(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value / 100);
}
