import type { ContainerClient } from '@azure/storage-blob';
import type { DiskPhoto } from './photo-upload-stream.mjs';
export function persistProductDerivatives(
  container: ContainerClient,
  originalKey: string,
  photo: DiskPhoto,
  options?: { render?: (originalKey: string, sourcePath: string) => Promise<Array<{ key: string; width: number; contentType: string; bytes: Buffer }>> },
): Promise<Array<{ key: string; width: number }>>;
