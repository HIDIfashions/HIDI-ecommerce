import { PublicReadError, readPublicJson } from "./public-read";

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
    ? process.env.NODE_ENV === "production"
      ? normalizeApiUrl(process.env.API_URL) ||
        normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL) ||
        LOCAL_API_URL
      : LOCAL_API_URL
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
  bustMm?: number | null;
  waistMm?: number | null;
  hipMm?: number | null;
  shoulderMm?: number | null;
  sleeveLengthMm?: number | null;
  garmentLengthMm?: number | null;
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
  verifiedReviewCount: number;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
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
  averageRating?: number;
  reviewCount?: number;
};

type PublicListOptions = { strict?: boolean; timeoutMs?: number };

async function fetchPublicList(
  url: URL | string,
  options: PublicListOptions = {},
): Promise<ApiProduct[]> {
  const development = process.env.NODE_ENV !== "production";
  try {
    return await readPublicJson<ApiProduct[]>(url, {
      totalTimeoutMs: options.timeoutMs ?? (development ? 25000 : 8000),
      attemptTimeoutMs: 4000,
      maxAttempts: development ? 15 : 2,
      retryDelayMs: development ? 350 : 200,
      validate: Array.isArray,
    });
  } catch (error) {
    console.error("[HIDI catalogue] Unable to load products:", error);
    // Preserve existing callers; streamed homepage/related sections explicitly
    // distinguish an upstream failure from a successful empty catalogue.
    if (options.strict) throw error;
    return [];
  }
}

export async function getProducts(category?: string): Promise<ApiProduct[]> {
  const url = new URL(`${API_URL}/products`);
  if (category) url.searchParams.set("category", category);
  return fetchPublicList(url);
}

export async function getFeaturedProducts(limit = 4): Promise<ApiProduct[]> {
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 8) : 4;
  const url = new URL(`${API_URL}/products/featured`);
  url.searchParams.set("limit", String(safeLimit));
  return fetchPublicList(url, { strict: true });
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

  const budgetMs = process.env.NODE_ENV === "production" ? 8000 : 25000;
  const startedAt = performance.now();
  try {
    const related = await fetchPublicList(url, { strict: true, timeoutMs: budgetMs });
    if (related.length > 0) return related.slice(0, safeLimit);
  } catch (error) {
    // A missing endpoint can use the legacy fallback. An outage/rate limit must
    // not trigger a second expensive query against the same failing service.
    if (!(error instanceof PublicReadError) || error.status !== 404) return [];
  }

  const remainingMs = Math.floor(budgetMs - (performance.now() - startedAt));
  if (remainingMs <= 0) return [];
  const fallbackUrl = new URL(`${API_URL}/products`);
  // One extra card allows the current product to be excluded without loading
  // the entire catalogue. The API controller passes this bound to Prisma.
  fallbackUrl.searchParams.set("limit", String(safeLimit + 1));
  const catalogue = await fetchPublicList(fallbackUrl, { timeoutMs: remainingMs });
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
  if (!response.ok) return {
    averageRating: 0,
    reviewCount: 0,
    verifiedReviewCount: 0,
    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    reviews: [],
  };
  return response.json();
}

export function formatPaise(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value / 100);
}
