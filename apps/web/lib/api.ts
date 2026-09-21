const LOCAL_API_URL = "http://localhost:4000/v1";

function normalizeApiUrl(value: string | undefined) {
  const url = value?.trim();
  return url ? url.replace(/\/$/, "") : "";
}

// Server-rendered storefront pages should talk to the Nest API over the local
// Codespaces/dev network. NEXT_PUBLIC_API_URL may point at a browser-facing
// forwarded port, which can be private/authenticated and return an empty
// catalogue when fetched server-side.
export const API_URL =
  typeof window === "undefined"
    ? normalizeApiUrl(process.env.API_URL) || LOCAL_API_URL
    : normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL) ||
      normalizeApiUrl(process.env.API_URL) ||
      LOCAL_API_URL;

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
  const target = String(url);
  let lastError: unknown;

  // Branch switches restart the Nest watcher in Codespaces. Retry briefly so
  // the storefront does not look empty during that small restart window.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(target, { cache: "no-store" });
      if (response.ok) {
        const body = await response.json();
        return Array.isArray(body) ? body : [];
      }

      lastError = new Error(`HIDI API returned ${response.status} for ${target}`);
      if (response.status < 500) break;
    } catch (error) {
      lastError = error;
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  console.error("[HIDI catalogue] Unable to load products:", lastError);
  return [];
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
