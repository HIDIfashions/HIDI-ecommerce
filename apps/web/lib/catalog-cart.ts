import { getCartSession } from "./cart-session";

import { BROWSER_API_URL } from "@/lib/browser-api";
const API = BROWSER_API_URL;
const pending = new Set<string>();

export class CatalogCartError extends Error {
  constructor(message: string, public readonly refreshCatalogue = false) {
    super(message);
    this.name = "CatalogCartError";
  }
}

/** Uses the SAME cart session, endpoint and header event as the existing HIDI cart.
 * No optimistic success, automatic retries, price submission, or stock reservation. */
export async function addCatalogueVariant(variantId: string): Promise<void> {
  if (!variantId.trim()) throw new CatalogCartError("Please choose a size first.");
  let sessionId: string;
  try { sessionId = getCartSession(); }
  catch { throw new CatalogCartError("Enable browser storage to use your shopping bag."); }
  if (!sessionId) throw new CatalogCartError("Your bag session is unavailable. Please reload.");
  const key = `${sessionId}:${variantId}`;
  if (pending.has(key)) throw new CatalogCartError("This item is already being added. Please wait.");

  pending.add(key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const uncertain = "We couldn’t confirm the update. Check your bag before trying again.";
  try {
    let response: Response;
    try {
      response = await fetch(`${API}/carts/${encodeURIComponent(sessionId)}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, quantity: 1 }),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch { throw new CatalogCartError(uncertain); }

    let data: unknown;
    try { data = await response.json(); }
    catch { throw new CatalogCartError(uncertain); }
    const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
    if (!response.ok) {
      const raw = record.message;
      const messages = Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === "string") : [];
      const serverMessage = typeof raw === "string" ? raw : messages.join(" ");
      // 5xx can happen after a write: do not imply retrying is harmless.
      const message = response.status >= 500 ? uncertain
        : response.status === 429 ? "Please wait a moment before adding another item."
        : serverMessage || "We couldn’t add this item. Please check your selection.";
      throw new CatalogCartError(message, response.status === 400 || response.status === 404 || response.status === 409);
    }
    if (!Number.isInteger(record.itemCount) || (record.itemCount as number) < 0) {
      throw new CatalogCartError(uncertain);
    }
    window.dispatchEvent(new CustomEvent("hidi-cart-updated", { detail: record.itemCount }));
  } finally {
    clearTimeout(timeout);
    pending.delete(key);
  }
}
