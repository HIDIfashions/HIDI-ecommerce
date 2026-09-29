import type { ApiCart, CartLine } from "../models/cart";
import { hidiRequest, HidiApiError } from "../network/apiClient";
import { hidiEndpoints } from "../network/endpoints";

export function lineQuantityForVariant(cart: ApiCart | null, variantId: string) {
  return cart?.items.filter((line) => line.variant.id === variantId).reduce((sum, line) => sum + line.quantity, 0) ?? 0;
}

export async function fetchCart(sessionId: string) {
  return hidiRequest<ApiCart>(hidiEndpoints.cart(sessionId));
}

export async function addCartVariant(
  sessionId: string,
  variantId: string,
  quantity: number,
  before: ApiCart | null,
): Promise<{ cart: ApiCart; reconciled: boolean }> {
  const beforeQty = lineQuantityForVariant(before, variantId);
  try {
    const cart = await hidiRequest<ApiCart>(hidiEndpoints.cartItems(sessionId), {
      method: "POST",
      body: JSON.stringify({ variantId, quantity }),
      timeoutMs: 20000,
    });
    return { cart, reconciled: false };
  } catch (cause) {
    const error = cause as HidiApiError;
    const ambiguous = error.status === 0 || error.status === 408 || error.status >= 500;
    if (!ambiguous) throw cause;

    const cart = await fetchCart(sessionId);
    const afterQty = lineQuantityForVariant(cart, variantId);
    if (afterQty >= beforeQty + quantity) return { cart, reconciled: true };

    throw new HidiApiError({
      message: "We couldn’t confirm the bag update. Review your bag before trying again.",
      status: error.status,
      retryable: false,
    });
  }
}

export async function updateCartQuantity(sessionId: string, lineId: string, quantity: number) {
  return hidiRequest<ApiCart>(hidiEndpoints.cartItem(sessionId, lineId), {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
    timeoutMs: 20000,
  });
}

export async function removeCartLine(sessionId: string, lineId: string) {
  return hidiRequest<ApiCart>(hidiEndpoints.cartItem(sessionId, lineId), {
    method: "DELETE",
    timeoutMs: 20000,
  });
}

export function findLine(cart: ApiCart | null, lineId: string): CartLine | undefined {
  return cart?.items.find((line) => line.id === lineId);
}
