import { NextRequest, NextResponse } from "next/server";

function backendBase() {
  const explicit = process.env.INTERNAL_API_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  // In Codespaces/local development the API is in the same machine/container.
  // Do not route server-to-server traffic through the forwarded GitHub URL.
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:4000/v1";

  return (process.env.API_URL ?? "http://127.0.0.1:4000/v1").replace(/\/$/, "");
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (!Array.isArray(path) || path.length === 0) {
    return NextResponse.json({ message: "Invalid API path" }, { status: 400 });
  }

  const incoming = new URL(request.url);
  const target = new URL(
    `${backendBase()}/${path.map((part) => encodeURIComponent(part)).join("/")}`,
  );
  incoming.searchParams.forEach((value, key) => target.searchParams.append(key, value));

  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");
  if (authorization) headers.set("authorization", authorization);
  if (contentType) headers.set("content-type", contentType);
  if (accept) headers.set("accept", accept);

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD"
    ? undefined
    : await request.arrayBuffer();

  try {
    const response = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });

    if (response.status === 204) {
      return new Response(null, { status: 204 });
    }

    const responseType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    // Every customer commerce endpoint is JSON. If an upstream gateway returns
    // HTML (for example a Codespaces sign-in page), never leak it to the client
    // or let response.json() fail with an "Unexpected token <" error.
    if (!responseType.toLowerCase().includes("json")) {
      return NextResponse.json(
        { message: "HIDI service is temporarily unavailable. Please retry." },
        { status: 502 },
      );
    }

    return new Response(text, {
      status: response.status,
      headers: { "content-type": responseType || "application/json", "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { message: "Unable to reach the HIDI service. Please retry." },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;

