import type { BlockBlobClient } from '@azure/storage-blob';
import type { DiskPhoto } from './photo-upload-stream.mjs';
export function uploadDiskPhotoToBlob(blob: BlockBlobClient, photo: DiskPhoto, contentType: string, options?: { signal?: AbortSignal }): Promise<void>;
