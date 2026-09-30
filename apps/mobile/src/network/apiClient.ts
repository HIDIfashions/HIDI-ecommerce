import { HIDI_GATEWAY_BASE_URL, HIDI_REQUEST_TIMEOUT_MS } from "./config";

export class HidiApiError extends Error {
  status: number;
  code?: string;
  correlationId?: string;
  retryable: boolean;
  retryAfterMs: number;
  outcome: "failed" | "unknown";
  constructor(input: { message: string; status: number; code?: string; correlationId?: string; retryable?: boolean; retryAfterMs?: number; outcome?: "failed" | "unknown" }) {
    super(input.message);
    this.name = "HidiApiError";
    this.status = input.status;
    this.code = input.code;
    this.correlationId = input.correlationId;
    this.retryable = input.retryable ?? input.status >= 500;
    this.retryAfterMs = input.retryAfterMs ?? 0;
    this.outcome = input.outcome ?? "failed";
  }
}
export type RequestOptions = Omit<RequestInit, "headers"> & { accessToken?: string; headers?: Record<string, string>; timeoutMs?: number };
export function parseRetryAfter(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  const seconds = /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(seconds) ? Math.min(1800000, Math.max(0, seconds)) : 0;
}
function messageFrom(value: unknown): string {
  if (typeof value === "string" && value.length <= 240 && !/[<>]/.test(value)) return value;
  if (Array.isArray(value)) return value.filter(x => typeof x === "string").join(". ").slice(0, 240) || "HIDI request failed.";
  return "HIDI request failed.";
}

/** No automatic retries. Uncertain writes must reconcile at the operation boundary. */
export async function hidiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!path || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path) || /(?:^|\/)\.\.(?:\/|\?|$)/.test(path) || path.includes("#")) {
    throw new HidiApiError({ message: "Unsupported HIDI request path.", status: 400, retryable: false });
  }
  const { accessToken, timeoutMs = HIDI_REQUEST_TIMEOUT_MS, signal, headers, ...request } = options;
  const controller = new AbortController();
  const readOnly = !request.method || /^(GET|HEAD)$/i.test(request.method);
  let timedOut = false;
  const abort = () => controller.abort();
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(1, Math.min(timeoutMs, 60000)));
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    if (controller.signal.aborted) throw new HidiApiError({ message: "Request cancelled.", status: 499, code: "CANCELLED", retryable: false });
    const response = await fetch(HIDI_GATEWAY_BASE_URL + (path.startsWith("/") ? path : "/" + path), {
      ...request,
      signal: controller.signal,
      headers: { Accept: "application/json", ...(request.body ? { "Content-Type": "application/json" } : {}), ...headers, ...(accessToken ? { Authorization: "Bearer " + accessToken } : {}) },
    });
    if (response.ok && (response.status === 204 || request.method === "HEAD")) return undefined as T;
    const correlation = response.headers.get("x-correlation-id") ?? response.headers.get("x-request-id");
    const safeCorrelation = correlation && /^[a-zA-Z0-9_-]{1,100}$/.test(correlation) ? { correlationId: correlation } : {};
    const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
    if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("json")) {
      throw new HidiApiError({ message: "HIDI returned an unexpected response. Please check the status before retrying an update.", status: response.ok ? 502 : response.status, ...safeCorrelation, retryAfterMs, retryable: readOnly, outcome: readOnly ? "failed" : "unknown" });
    }
    let payload: any;
    try { payload = await response.json(); } catch {
      throw new HidiApiError({ message: "HIDI returned an unreadable response.", status: response.ok ? 502 : response.status, ...safeCorrelation, retryable: readOnly, outcome: readOnly ? "failed" : "unknown" });
    }
    if (!response.ok) {
      const error = payload?.error ?? payload;
      throw new HidiApiError({ message: messageFrom(error?.message ?? payload?.message), status: response.status, ...(typeof error?.code === "string" ? { code: error.code.slice(0, 80) } : {}), ...safeCorrelation, retryAfterMs, retryable: readOnly && (response.status === 429 || response.status >= 500), outcome: !readOnly && response.status >= 500 ? "unknown" : "failed" });
    }
    return payload as T;
  } catch (error) {
    if (error instanceof HidiApiError) throw error;
    const cancelled = controller.signal.aborted && !timedOut;
    throw new HidiApiError({
      message: cancelled ? "Request cancelled." : timedOut ? "The request timed out. Check the current status before retrying an update." : "Unable to reach HIDI. Check your connection.",
      status: cancelled ? 499 : timedOut ? 408 : 0,
      code: cancelled ? "CANCELLED" : timedOut ? "TIMEOUT" : "NETWORK_UNAVAILABLE",
      retryable: readOnly && !cancelled,
      outcome: readOnly ? "failed" : "unknown",
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
