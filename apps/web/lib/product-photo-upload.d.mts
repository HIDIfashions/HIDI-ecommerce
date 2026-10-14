export const MAX_PHOTO_BYTES: number;
export const MAX_PHOTO_BODY_BYTES: number;
export class PhotoUploadError extends Error { status: number; constructor(message: string, status?: number); }
export function acquirePhotoUploadSlot(): () => void;
export function readPhotoForm(request: Request): Promise<FormData>;
