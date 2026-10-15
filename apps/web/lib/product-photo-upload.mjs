/** Product-photo multipart limits only; payment and other request limits are unchanged. */
export const MAX_PHOTO_BYTES = 40 * 1024 * 1024;
export const MAX_PHOTO_BODY_BYTES = 42 * 1024 * 1024;
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
export async function readPhotoForm(request) {
  const type = request.headers.get('content-type') || '';
  const length = request.headers.get('content-length');
  if (!/^multipart\/form-data\s*;/i.test(type) || !request.body) throw new PhotoUploadError('Choose an image file.');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_PHOTO_BODY_BYTES)) {
    await request.body.cancel().catch(() => {});
    throw new PhotoUploadError('Photo upload request exceeds 42 MiB.',413);
  }
  const reader = request.body.getReader(); const chunks = []; let total = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_PHOTO_BODY_BYTES) throw new PhotoUploadError('Photo upload request exceeds 42 MiB.',413);
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  let form;
  try { form = await new Response(Buffer.concat(chunks,total), {headers:{'content-type':type}}).formData(); }
  catch { throw new PhotoUploadError('The photo upload is incomplete or malformed.'); }
  const entries = [...form.entries()];
  const files = entries.filter(([,value]) => typeof value !== 'string');
  if (entries.length > 20 || files.length !== 1 || files[0][0] !== 'file') throw new PhotoUploadError('Upload one photo per request.');
  if (entries.some(([,value]) => typeof value === 'string' && value.length > 8192)) throw new PhotoUploadError('Photo details are too long.');
  const file = files[0][1];
  if (file.size < 1 || file.size > MAX_PHOTO_BYTES) throw new PhotoUploadError('Image must be no larger than 40 MiB.',413);
  return form;
}
