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
