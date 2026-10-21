export const IMAGE_VERSION: string;
export const SOURCE_LIMIT: number;
export const PIXEL_LIMIT: number;
export const PERSISTENT_DERIVATIVE_VERSION: string;
export const PERSISTENT_DERIVATIVE_WIDTHS: readonly number[];

export function mediaPath(value: unknown): string | null;
export function acceptsWebp(accept?: string): boolean;
export function imageRequest(url: URL, accept?: string):
  | null
  | { error: number }
  | { source: string; width: number; format: "webp" | "jpeg"; quality: number };
export function derivativeKey(spec: { source: string; width: number; format: string; quality?: number }): string;
export function masterKey(source: string, width?: number): string;
export function persistentDerivativeBlobKey(originalKey: string, width: number, format?: "webp"): string | null;
export function persistentDerivativeMediaPath(source: string, width: number, format?: "webp"): string | null;
export function boundedBody(response: Response): Promise<Buffer>;
export function resizedImage(sharp: any, input: Buffer | string, width: number, format: "webp" | "jpeg", quality: number): Promise<Buffer>;
export function createImageStore(options: {
  sharp: any;
  fetchSource: (source: string) => Promise<any>;
  cacheDir?: string;
  seedDir?: string;
  maxPending?: number;
}): {
  get(spec: { source: string; width: number; format: "webp" | "jpeg"; quality: number }): Promise<{ bytes: Buffer; cache: string }>;
  master(source: string, width?: number): Promise<Buffer>;
};
export function createProductImageHandler(options: {
  origin: string;
  runtimeRoot?: string;
  sharp?: any;
  fetchSource?: (source: string) => Promise<any>;
  fetchDerivative?: (path: string) => Promise<Buffer | null>;
  cacheDir?: string;
  seedDir?: string;
}): {
  handle(request: any, response: any, pathname: string): Promise<boolean>;
  store: ReturnType<typeof createImageStore>;
  startWarm(): void;
  stopWarm(): void;
};
