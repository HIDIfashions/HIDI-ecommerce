import type { CardVideo } from "./product-card-media-utils";

/**
 * GitHub-managed video manifest. It is deliberately empty until REAL clips exist.
 * No database migration and no dummy videos are installed in the shop.
 * Keys must exactly match the product slug from the catalogue.
 * Store media in apps/web/public/video/products/<slug>/ or on your approved HTTPS CDN.
 * Native video supports MP4/WebM URLs, not YouTube/Instagram page URLs.
 *
 * Example (enable only after the assets are uploaded):
 * "aara-sage-work-kurta": [{
 *   id: "aara-walk",
 *   url: "/video/products/aara-sage-work-kurta/walk.mp4",
 *   poster: "/products/aara-sage-work-kurta/01-main.png",
 *   label: "Aara kurta — fit and movement",
 * }],
 *
 * For spoken content add a same-origin WebVTT captionsUrl. Muted is NOT a captions substitute.
 * These clips are product-level: do not imply they change with the selected colour.
 */
export const PRODUCT_CARD_VIDEOS: Readonly<Record<string, readonly CardVideo[]>> = {};

const NO_VIDEOS: readonly CardVideo[] = [];

export function getProductCardVideos(slug: string): readonly CardVideo[] {
  return Object.prototype.hasOwnProperty.call(PRODUCT_CARD_VIDEOS, slug)
    ? PRODUCT_CARD_VIDEOS[slug] : NO_VIDEOS;
}
