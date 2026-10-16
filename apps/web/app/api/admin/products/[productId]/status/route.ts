import { NextRequest } from "next/server";
import { proxyProducts } from "@/lib/admin-products-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ productId: string }> }) {
  const { productId } = await context.params;
  return proxyProducts(request, `/${encodeURIComponent(productId)}/status`);
}
