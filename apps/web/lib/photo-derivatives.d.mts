import type { ContainerClient } from "@azure/storage-blob";
import type { DiskPhoto } from "./photo-upload-stream.mjs";
export type ProductDerivativeResult = { width: number; key: string; bytes: number; created: boolean };
export function createAndUploadProductDerivatives(
  container: ContainerClient,
  originalKey: string,
  photo: DiskPhoto,
  options?: { widths?: readonly number[]; processor?: unknown; signal?: AbortSignal }
): Promise<ProductDerivativeResult[]>;
