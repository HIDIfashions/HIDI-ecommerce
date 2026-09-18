export class ProductApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
export async function productApi<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`/api/admin/products${path}`, {
    method, cache: "no-store", credentials: "same-origin",
    ...(data !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(data) } : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(". ") : body?.message;
    throw new ProductApiError(typeof message === "string" ? message : "Unable to complete product request.", response.status);
  }
  return body as T;
}
