const LOCAL_API_URL = "http://localhost:4000/v1";
function normalizeApiUrl(value: string | undefined) {
  const url = value?.trim();
  return url ? url.replace(/\/$/, "") : "";
}

function productionApiUrl() {
  const configured =
    normalizeApiUrl(process.env.API_URL) ||
    normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL);
  if (!configured) {
    throw new Error("HIDI production API URL is not configured");
  }
  return configured;
}

function browserApiUrl() {
  const configured = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL) || normalizeApiUrl(process.env.API_URL);
  if (configured.endsWith("/api/store")) return `${window.location.origin}/api/store`;
  return configured || (process.env.NODE_ENV === "production" ? `${window.location.origin}/api/store` : LOCAL_API_URL);
}

// Server-rendered storefront pages should talk to the Nest API over the local
// Codespaces/dev network. NEXT_PUBLIC_API_URL may point at a browser-facing
// forwarded port, which can be private/authenticated and return an empty
// catalogue when fetched server-side.
export const API_URL =
  typeof window === "undefined"
    ? process.env.NODE_ENV === "production"
      ? productionApiUrl()
      : LOCAL_API_URL
    : browserApiUrl();

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

async function fetchPublicList(url: URL | string): Promise<ApiProduct[]> {
  const target = String(url);
  let lastError: unknown;

  // The root dev command starts Next and Nest in parallel. Nest performs a
  // full TypeScript build before opening port 4000, so the first storefront
  // request can arrive several seconds earlier. Do not turn that startup race
  // into an empty catalogue. Development gets a longer readiness window;
  // production keeps retries short so genuine upstream failures fail quickly.
  const maxAttempts = process.env.NODE_ENV === "production" ? 3 : 15;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(target, { cache: "no-store" });
      if (response.ok) {
        const body = await response.json();
        return Array.isArray(body) ? body : [];
      }

      lastError = new Error(`HIDI API returned ${response.status} for ${target}`);

      // A client error will not be fixed by waiting for API readiness.
      if (response.status >= 400 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxAttempts - 1) {
      const delayMs = process.env.NODE_ENV === "production"
        ? 300 * (attempt + 1)
        : Math.min(350 * (attempt + 1), 1500);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
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

export async function getFeaturedProducts(limit = 4): Promise<ApiProduct[]> {
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 8) : 4;
  const url = new URL(`${API_URL}/products/featured`);
  url.searchParams.set("limit", String(safeLimit));
  const featured = await fetchPublicList(url);
  if (featured.length > 0) return featured;
  return (await getProducts()).slice(0, safeLimit);
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
