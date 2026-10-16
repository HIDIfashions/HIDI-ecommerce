export const IMAGE_SKU_ENDPOINT: string;
export function canonicalColour(value: unknown): string;
export function imageSkuKey(value: unknown): string;
export function validImageSku(value: string): boolean;
export function validateImageSkuRows<T extends {mode: string; imageSku?: string; errors: string[]; productSlug: string; color: string}>(rows: T[]): Array<T & {imageSku: string}>;
export function preflightMappings(rows: Array<{mode: string; imageSku?: string; productSlug: string; color: string}>): Promise<void>;
export function saveImageSku(row: {imageSku?: string; color: string}, product: {id: string; updatedAt: string}): Promise<void>;
export function prepareMappedPhotos<T>(candidates: T[]): Promise<T[]>;
export function uploadMappedPhotoCandidate(item: unknown): Promise<unknown>;
