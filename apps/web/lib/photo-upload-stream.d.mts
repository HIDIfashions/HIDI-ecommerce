export type DiskPhoto = { path: string; size: number; type: string; name: string; sha256: string; cleanup: () => Promise<void> };
export type StreamedPhotoForm = { get(name: string): DiskPhoto | string | null; cleanup(): Promise<void> };
export { PhotoUploadError, acquirePhotoUploadSlot } from './product-photo-upload.mjs';
export function readStreamedPhotoForm(request: Request): Promise<StreamedPhotoForm>;
