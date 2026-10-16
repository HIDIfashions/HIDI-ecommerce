import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { adminApiHeaders, isAdminRequest } from "@/lib/admin-auth";
const headers = { "cache-control": "private, no-store" };
const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers });

/** Dedicated admin proxy: cookies/secret keys never enter the product payload. */
export async function proxyProducts(request: NextRequest, suffix = "") {
  if (!isAdminRequest(request)) return reply("Admin session expired. Unlock HIDI Admin before continuing.", 401);
  const write = request.method !== "GET";
  if (write) {
    if (request.headers.get("sec-fetch-site") === "cross-site") return reply("Cross-site product changes are not allowed.", 403);
    const origin = request.headers.get("origin");
    if (origin) {
      const allowedHosts = [request.nextUrl.host, request.headers.get("host"), request.headers.get("x-forwarded-host")?.split(",")[0].trim()].filter(Boolean);
      try { if (!allowedHosts.includes(new URL(origin).host)) return reply("Request origin is not allowed.", 403); }
      catch { return reply("Invalid request origin.", 403); }
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply("JSON is required.", 415);
  }
  let payload: string | undefined;
  if (write) {
    const reader = request.body?.getReader();
    if (!reader) return reply("A request body is required.", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > 65536) { await reader.cancel(); return reply("Product request exceeds 64 KB.", 413); }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size); let position = 0;
      for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
      payload = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      JSON.parse(payload);
    } catch { return reply("Invalid JSON request.", 400); }
    finally { reader.releaseLock(); }
  }
  try {
    const target = new URL(`${API_URL}/admin/products${suffix}`);
    if (!write) {
      const parameters = suffix === "/price-tags" ? ["q", "status", "stock", "productId"] : (!suffix ? ["q", "status", "page"] : []);
      for (const parameter of parameters) {
        const value = request.nextUrl.searchParams.get(parameter); if (value !== null) target.searchParams.set(parameter, value);
      }
    }
    const response = await fetch(target, {
      method: request.method, cache: "no-store", signal: AbortSignal.timeout(25000),
      headers: { ...adminApiHeaders(request), ...(write ? { "content-type": "application/json" } : {}) }, body: payload,
    });
    if (response.status === 401) return reply("Admin session expired. Sign in again.", 401);
    if (response.status === 403) return reply("Your admin role does not allow this action.", 403);
    if (response.status >= 500) return reply("The API could not complete this request. Check the backend log; no success was confirmed.", 502);
    const body = await response.json().catch(() => ({ message: "Invalid response from the product API." }));
    return NextResponse.json(body, { status: response.status, headers });
  } catch { return reply("Cannot reach the HIDI API on port 4000, or the request timed out. Check Products before retrying a creation.", 502); }
}
