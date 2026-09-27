/** Bounded, uncached GETs for public catalogue data only. Never use for writes. */
export class PublicReadError extends Error {
  readonly code: "http" | "network" | "timeout" | "invalid-response";
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    code: PublicReadError["code"],
    message: string,
    status?: number,
    retryable = false,
  ) {
    super(message);
    this.name = "PublicReadError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export type PublicReadOptions = {
  totalTimeoutMs?: number;
  attemptTimeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  validate?: (value: unknown) => boolean;
};

const transientStatuses = new Set([500, 502, 503, 504]);

async function readOnce<T>(
  url: string,
  timeoutMs: number,
  validate?: PublicReadOptions["validate"],
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new PublicReadError("timeout", "Catalogue request timed out", undefined, true);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });

  const request = (async () => {
    let response: Response;
    try {
      // Product responses contain live inventory. Do not introduce shared caching
      // or forward customer cookies/authorization headers through this helper.
      response = await fetch(url, { cache: "no-store", signal: controller.signal });
    } catch {
      if (controller.signal.aborted) throw controller.signal.reason;
      throw new PublicReadError("network", "Catalogue service is unreachable", undefined, true);
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new PublicReadError(
        "http",
        `Catalogue request failed (HTTP ${response.status})`,
        response.status,
        transientStatuses.has(response.status),
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (error instanceof SyntaxError) {
        throw new PublicReadError("invalid-response", "Catalogue returned invalid JSON");
      }
      throw new PublicReadError("network", "Catalogue response was interrupted", undefined, true);
    }
    if (validate && !validate(body)) {
      throw new PublicReadError("invalid-response", "Catalogue returned an unexpected response");
    }
    return body as T;
  })();

  try {
    // Include response-body decoding in the deadline, not only response headers.
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readPublicJson<T>(
  url: URL | string,
  options: PublicReadOptions = {},
): Promise<T> {
  const {
    totalTimeoutMs = 8000,
    attemptTimeoutMs = 4000,
    maxAttempts = 2,
    retryDelayMs = 200,
    validate,
  } = options;
  for (const value of [totalTimeoutMs, attemptTimeoutMs, maxAttempts]) {
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
      throw new RangeError("Catalogue timeout and attempt limits must be positive integers");
    }
  }
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
    throw new RangeError("Catalogue retry delay must be non-negative");
  }

  const deadline = performance.now() + totalTimeoutMs;
  let lastError: unknown = new PublicReadError("timeout", "Catalogue request budget exhausted");
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const remainingMs = Math.floor(deadline - performance.now());
    if (remainingMs <= 0) break;
    try {
      return await readOnce<T>(String(url), Math.min(attemptTimeoutMs, remainingMs), validate);
    } catch (error) {
      lastError = error;
      // Never retry 4xx (including rate limits), invalid JSON, or invalid shapes.
      if (!(error instanceof PublicReadError) || !error.retryable) throw error;
      if (attempt === maxAttempts - 1) break;
      const delay = Math.min(retryDelayMs * (attempt + 1), 1500);
      if (deadline - performance.now() <= delay) break;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
