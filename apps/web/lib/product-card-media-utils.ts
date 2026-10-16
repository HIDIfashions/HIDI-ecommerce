/** Product media URLs are data, never HTML. No network requests happen here. */
export type CardImage = {
  id: string; url: string; alt?: string | null; position?: number;
  thumbnailUrl?: string;
};
export type CardVideo = {
  id: string; url: string; poster?: string; label?: string; position?: number;
  captionsUrl?: string;
};
export type CardMedia =
  | { kind: "image"; id: string; url: string; label: string; position: number; thumbnailUrl?: string }
  | { kind: "video"; id: string; url: string; label: string; position: number; poster?: string; captionsUrl?: string };

/** Same-origin paths or HTTPS media only. Do not put secret/signed-expiring URLs here. */
export function safeMediaUrl(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const value = input.trim();
  if (!value || /[\\\u0000-\u0020\u007f]/.test(value)) return undefined;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* Invalid URLs are omitted rather than rendered. */ }
  return undefined;
}

/** Photos keep database order; videos follow photos unless given an explicit position. */
export function buildCardMedia(name: string, images: readonly CardImage[], videos: readonly CardVideo[] = []): CardMedia[] {
  const result: CardMedia[] = [];
  const seen = new Set<string>();
  for (const [index, image] of images.entries()) {
    const url = safeMediaUrl(image.url);
    if (!url || seen.has(`image:${url}`)) continue;
    seen.add(`image:${url}`);
    result.push({ kind: "image", id: `image:${image.id || index}:${url}`, url,
      label: image.alt?.trim() || `${name} — photo ${index + 1}`,
      position: Number.isFinite(image.position) ? image.position! : index,
      thumbnailUrl: safeMediaUrl(image.thumbnailUrl) });
  }
  const lastPhoto = result.length ? Math.max(...result.map(item => item.position)) : -1;
  for (const [index, video] of videos.entries()) {
    const url = safeMediaUrl(video.url);
    if (!url || seen.has(`video:${url}`)) continue;
    seen.add(`video:${url}`);
    result.push({ kind: "video", id: `video:${video.id || index}:${url}`, url,
      label: video.label?.trim() || `${name} — product video ${index + 1}`,
      position: Number.isFinite(video.position) ? video.position! : lastPhoto + index + 1,
      poster: safeMediaUrl(video.poster), captionsUrl: safeMediaUrl(video.captionsUrl) });
  }
  return result.sort((a, b) => a.position - b.position);
}

export function wrapMediaIndex(index: number, length: number): number {
  return length > 0 ? ((index % length) + length) % length : 0;
}

/** Automatic previews never select a video. */
export function nextPhotoIndex(items: readonly CardMedia[], current: number): number {
  if (!items.length) return 0;
  for (let step = 1; step <= items.length; step++) {
    const index = wrapMediaIndex(current + step, items.length);
    if (items[index].kind === "image") return index;
  }
  return current;
}

/** Preserve vertical page scrolling; only a deliberate horizontal swipe changes media. */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy) * 1.4) return 0;
  return dx < 0 ? 1 : -1;
}
