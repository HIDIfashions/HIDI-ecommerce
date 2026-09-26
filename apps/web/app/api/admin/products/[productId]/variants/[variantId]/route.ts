import { NextRequest } from "next/server";
import { proxyProducts } from "@/lib/admin-products-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PATCH(request: NextRequest, context: { params: Promise<{ productId: string; variantId: string }> }) {
  const { productId, variantId } = await context.params;
  return proxyProducts(request, `/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`);
}
