import { HIDI_GATEWAY_BASE_URL, HIDI_REQUEST_TIMEOUT_MS } from "./config";

export class HidiApiError extends Error {
  status: number;
  code?: string;
  correlationId?: string;
  retryable: boolean;

  constructor(input: {
    message: string;
    status: number;
    code?: string;
    correlationId?: string;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "HidiApiError";
    this.status = input.status;
    this.code = input.code;
    this.correlationId = input.correlationId;
    this.retryable = input.retryable ?? input.status >= 500;
  }
}

type RequestOptions = Omit<RequestInit, "headers"> & {
  accessToken?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export async function hidiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? HIDI_REQUEST_TIMEOUT_MS);
  const normalizedPath = path.startsWith("/") ? path : "/" + path;

  try {
    const response = await fetch(HIDI_GATEWAY_BASE_URL + normalizedPath, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.accessToken ? { Authorization: "Bearer " + options.accessToken } : {}),
        ...options.headers,
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    const correlationId =
      response.headers.get("x-correlation-id") ??
      response.headers.get("x-request-id") ??
      undefined;

    if (!contentType.toLowerCase().includes("json")) {
      throw new HidiApiError({
        message: "HIDI service returned an unexpected response.",
        status: response.status || 502,
        correlationId,
        retryable: true,
      });
    }

    const payload = await response.json();

    if (!response.ok) {
      const error = payload?.error ?? payload;
      throw new HidiApiError({
        message: error?.message ?? payload?.message ?? "HIDI request failed.",
        status: response.status,
        code: error?.code,
        correlationId: error?.correlationId ?? correlationId,
        retryable: error?.retryable ?? response.status >= 500,
      });
    }

    return payload as T;
  } catch (error) {
    if (error instanceof HidiApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new HidiApiError({
        message: "The request took too long. Please try again.",
        status: 408,
        retryable: true,
      });
    }
    throw new HidiApiError({
      message: "Unable to reach HIDI. Check your connection and try again.",
      status: 0,
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}
