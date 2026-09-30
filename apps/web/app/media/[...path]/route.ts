import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { productMediaContainer } from "@/lib/azure-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

// This route exposes only product images. Documents and migration exports use separate private containers.
export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (path[0] !== "products" || path.some(p => !/^[a-zA-Z0-9_-]+(?:\.(?:jpg|jpeg|png|webp|avif))?$/.test(p))) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await productMediaContainer().getBlobClient(path.join("/")).download();
    if (!result.readableStreamBody || !TYPES.has(result.contentType ?? "")) {
      (result.readableStreamBody as Readable | undefined)?.destroy();
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const headers = new Headers({
      "Content-Type": result.contentType!,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    if (result.etag) headers.set("ETag", result.etag);
    if (result.lastModified) headers.set("Last-Modified", result.lastModified.toUTCString());
    if (request.headers.get("if-none-match") === result.etag) {
      (result.readableStreamBody as Readable).destroy();
      return new Response(null, { status: 304, headers });
    }
    if (result.contentLength !== undefined) headers.set("Content-Length", String(result.contentLength));
    return new Response(Readable.toWeb(result.readableStreamBody as Readable) as ReadableStream, { headers });
  } catch (error) {
    const missing = (error as { statusCode?: number }).statusCode === 404;
    return new Response(null, { status: missing ? 404 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
