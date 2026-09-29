import type { ApiProduct } from "../models/product";
import { hidiRequest, HidiApiError } from "../network/apiClient";
import { hidiEndpoints } from "../network/endpoints";

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

export type Serviceability = {
  pin: string;
  serviceable: boolean;
  city?: string | null;
  district?: string | null;
  stateCode?: string | null;
};

export async function getProductDetail(slug: string) {
  return hidiRequest<ApiProduct>(hidiEndpoints.product(slug));
}

export async function getProductReviews(productId: string) {
  return hidiRequest<ApiProductReviews>(hidiEndpoints.productReviews(productId));
}

export async function getRelatedProducts(slug: string, limit = 4) {
  return hidiRequest<ApiProduct[]>(hidiEndpoints.related(slug) + "?limit=" + Math.min(Math.max(limit, 1), 8));
}

export async function checkDelivery(pin: string) {
  if (!/^[1-9]\d{5}$/.test(pin)) {
    throw new HidiApiError({ message: "Enter a valid six-digit Indian PIN code.", status: 400, retryable: false });
  }
  return hidiRequest<Serviceability>(hidiEndpoints.deliveryServiceability(pin), { timeoutMs: 10000 });
}
