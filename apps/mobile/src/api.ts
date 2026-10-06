import { apiBaseUrl, requestTimeoutMs, supabasePublishableKey, supabaseUrl } from "./config";
import type { AuthSession, Campaign, Cart, InsiderSummary, Product } from "./domain";

export class ApiError extends Error {
  constructor(message: string, public status = 0, public retryable = false) { super(message); this.name = "ApiError"; }
}

type Options = Omit<RequestInit, "headers"> & { accessToken?: string; timeoutMs?: number; headers?: Record<string, string> };
export async function request<T>(path: string, options: Options = {}): Promise<T> {
  if (!path.startsWith("/") || path.includes("..") || path.includes("#")) throw new ApiError("Unsupported request path.", 400);
  const { accessToken, timeoutMs = requestTimeoutMs, headers, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(apiBaseUrl + path, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: "Bearer " + accessToken } : {}),
        ...headers,
      },
    });
    if (response.status === 204) return undefined as T;
    const type = response.headers.get("content-type") ?? "";
    if (!type.toLowerCase().includes("json")) throw new ApiError("HIDI returned an unexpected response.", response.status, response.status >= 500);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const text = payload?.message ?? payload?.error?.message ?? "HIDI request failed.";
      throw new ApiError(Array.isArray(text) ? text.join(". ") : String(text), response.status, response.status === 429 || response.status >= 500);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error).name === "AbortError") throw new ApiError("The request timed out. Please try again.", 408, true);
    throw new ApiError("Unable to reach HIDI. Check your connection.", 0, true);
  } finally { clearTimeout(timer); }
}

export const commerceApi = {
  products: () => request<Product[]>("/products"),
  featured: () => request<Product[]>("/products/featured"),
  product: (slug: string) => request<Product>("/products/" + encodeURIComponent(slug)),
  related: (slug: string) => request<Product[]>("/products/" + encodeURIComponent(slug) + "/related"),
  campaign: () => request<Campaign>("/campaigns/active"),
  cart: (sessionId: string) => request<Cart>("/carts/" + encodeURIComponent(sessionId)),
  addCart: (sessionId: string, variantId: string, quantity: number) => request<Cart>("/carts/" + encodeURIComponent(sessionId) + "/items", { method: "POST", body: JSON.stringify({ variantId, quantity }) }),
  updateCart: (sessionId: string, lineId: string, quantity: number) => request<Cart>("/carts/" + encodeURIComponent(sessionId) + "/items/" + encodeURIComponent(lineId), { method: "PATCH", body: JSON.stringify({ quantity }) }),
  removeCart: (sessionId: string, lineId: string) => request<Cart>("/carts/" + encodeURIComponent(sessionId) + "/items/" + encodeURIComponent(lineId), { method: "DELETE" }),
  serviceability: (pin: string) => request<{ serviceable: boolean; city?: string; state?: string }>("/checkout/delivery-serviceability?pin=" + encodeURIComponent(pin)),
  relatedForBag: (slug: string) => request<Product[]>("/products/" + encodeURIComponent(slug) + "/related"),
  insider: (accessToken: string) => request<InsiderSummary>("/rewards/summary", { accessToken }),
  orders: (accessToken: string) => request<unknown[]>("/account/orders", { accessToken }),
  validatePromo: (code: string, sessionId: string) => request<{ valid: boolean; message?: string; discountPaise?: number }>("/promotions/validate", { method: "POST", body: JSON.stringify({ code, sessionId }) }),
  createStripeSheet: (payload: unknown, accessToken?: string) => request<{ paymentIntent: string; ephemeralKey?: string; customer?: string }>("/checkout/stripe/payment-sheet", { method: "POST", body: JSON.stringify(payload), accessToken, timeoutMs: 25000 }),
};

function authHeaders() { return { apikey: supabasePublishableKey, Authorization: "Bearer " + supabasePublishableKey, "Content-Type": "application/json" }; }
export function authConfigured() { return Boolean(supabaseUrl && supabasePublishableKey); }
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) throw new Error("Enter a valid 10-digit Indian mobile number.");
  return "+91" + local;
}
export async function sendOtp(phone: string) {
  if (!authConfigured()) throw new Error("Mobile verification is not configured in this build.");
  const normalized = normalizePhone(phone);
  const response = await fetch(supabaseUrl + "/auth/v1/otp", { method: "POST", headers: authHeaders(), body: JSON.stringify({ phone: normalized, channel: "whatsapp", create_user: true }) });
  if (!response.ok) throw new Error("Unable to send a verification code right now.");
  return normalized;
}
export async function verifyOtp(phone: string, token: string): Promise<AuthSession> {
  const response = await fetch(supabaseUrl + "/auth/v1/verify", { method: "POST", headers: authHeaders(), body: JSON.stringify({ phone, token, type: "sms" }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) throw new Error(String(payload?.msg ?? "That code is invalid or expired."));
  return payload as AuthSession;
}
