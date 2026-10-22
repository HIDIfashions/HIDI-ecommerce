/** Product-photo upload compatibility entrypoint. No fixed per-photo byte cap. */
export const MAX_PHOTO_BYTES = Number.MAX_SAFE_INTEGER;
export const MAX_PHOTO_BODY_BYTES = Number.MAX_SAFE_INTEGER;
export class PhotoUploadError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'PhotoUploadError'; this.status = status; }
}
let active = false;
/** Hold the slot through the Blob write, not just through reading the request. */
export function acquirePhotoUploadSlot() {
  if (active) throw new PhotoUploadError('Another photo is uploading. Let it finish before starting another batch.',429);
  active = true; let released = false;
  return () => { if (!released) { released = true; active = false; } };
}
/**
 * Backward-compatible entrypoint for older callers.
 * Delegates to the disk-backed streaming parser so large files are never buffered in memory.
 */
export async function readPhotoForm(request, options = {}) {
  const { readStreamedPhotoForm } = await import('./photo-upload-stream.mjs');
  return readStreamedPhotoForm(request, options);
}
