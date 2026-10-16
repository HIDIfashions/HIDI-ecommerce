/**
 * HIDI's existing endpoint accepts ONE photo per request. This helper turns one
 * multi-file selection into a sequential queue; it does not change that contract.
 * No automatic retries: a network error may happen after a server has saved a photo.
 */
export const MAX_PHOTOS_PER_SELECTION = 8;
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export type PhotoProgress = { current: number; total: number; fileName: string };
export type PhotoBatchResult = { uploaded: number; total: number };

type Options = {
  variantId: string;
  files: readonly File[];
  applyToColor: boolean;
  onProgress?: (progress: PhotoProgress) => void;
};

/** Check the whole selection BEFORE uploading anything. */
export function validatePhotoSelection(files: readonly File[]): void {
  if (!files.length) throw new Error("Choose at least one photo.");
  if (files.length > MAX_PHOTOS_PER_SELECTION) {
    throw new Error(`Choose up to ${MAX_PHOTOS_PER_SELECTION} photos at a time. Nothing was uploaded.`);
  }
  for (const file of files) {
    if (!ALLOWED.has(file.type)) {
      throw new Error(`${file.name}: use JPEG, PNG, WebP or AVIF. Nothing was uploaded.`);
    }
    if (file.size < 1 || file.size > MAX_PHOTO_BYTES) {
      throw new Error(`${file.name}: choose a non-empty photo no larger than 12 MB. Nothing was uploaded.`);
    }
  }
}

export class PhotoBatchError extends Error {
  readonly uploaded: number;
  readonly total: number;
  readonly failedFile: string;
  readonly notAttempted: number;
  readonly uncertain: boolean;

  constructor(uploaded: number, total: number, failedFile: string, uncertain: boolean, detail: string) {
    const notAttempted = total - uploaded - 1;
    const advice = uncertain
      ? "The last photo may already have reached the server. Check the product photos before selecting it again."
      : "Fix the error, then select only the failed and remaining photos. Do not reselect photos already saved.";
    super(`${uploaded} of ${total} photos confirmed saved. Stopped at ${failedFile}. ${notAttempted} not attempted. ${detail} ${advice}`);
    this.name = "PhotoBatchError";
    this.uploaded = uploaded;
    this.total = total;
    this.failedFile = failedFile;
    this.notAttempted = notAttempted;
    this.uncertain = uncertain;
  }
}

function serverMessage(body: unknown): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string") return message;
    if (Array.isArray(message)) return message.filter(v => typeof v === "string").join(". ");
  }
  return "The server did not confirm the photo upload.";
}

export async function uploadSkuPhotoBatch({ variantId, files, applyToColor, onProgress }: Options): Promise<PhotoBatchResult> {
  if (!variantId.trim()) throw new Error("Choose a SKU before adding photos.");
  // Snapshot the selection and scope. A later UI change must not redirect a batch.
  const queue = Array.from(files);
  validatePhotoSelection(queue);
  let uploaded = 0;
  for (const file of queue) {
    onProgress?.({ current: uploaded + 1, total: queue.length, fileName: file.name });
    const form = new FormData();
    form.set("file", file);
    form.set("applyToColor", String(applyToColor));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(`/api/admin/inventory/${encodeURIComponent(variantId)}/images`, {
        method: "POST", body: form, signal: controller.signal,
      });
      // Do not set Content-Type: the browser adds the correct multipart boundary.
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || body === null) {
        // This endpoint first stores bytes and then attaches metadata. Any server
        // failure after submission is ambiguous; do not automatically retry it.
        throw new PhotoBatchError(uploaded, queue.length, file.name, true, serverMessage(body));
      }
      uploaded += 1;
    } catch (error) {
      if (error instanceof PhotoBatchError) throw error;
      throw new PhotoBatchError(uploaded, queue.length, file.name, true,
        controller.signal.aborted ? "The upload timed out." : "The upload connection was interrupted.");
    } finally {
      clearTimeout(timer);
    }
  }
  return { uploaded, total: queue.length };
}
