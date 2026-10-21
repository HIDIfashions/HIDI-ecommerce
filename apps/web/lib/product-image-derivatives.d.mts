export const PRODUCT_DERIVATIVE_VERSION: string;
export const PRODUCT_DERIVATIVE_WIDTHS: readonly number[];
export function productMediaKey(source: string): string | null;
export function productDerivativeKey(originalKey: string, width: number): string | null;
export function productDerivativeUrl(source: string, width: number): string | null;
export function productDerivativeSrcSet(source: string, widths?: readonly number[]): string | null;
export function preferredProductDerivative(source: string, width?: number): string | null;
