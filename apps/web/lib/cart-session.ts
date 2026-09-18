const KEY = "hidi_cart_session";

export function getCartSession() {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

export function newCheckoutToken() {
  return crypto.randomUUID();
}

/** Explicit customer action only; the previous server-side bag is not deleted. */
export function startNewCartSession() {
  if (typeof window === "undefined") return "";
  const id = crypto.randomUUID();
  window.localStorage.setItem(KEY, id);
  window.dispatchEvent(new CustomEvent("hidi-cart-updated", { detail: 0 }));
  return id;
}
