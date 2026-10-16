import { NextRequest } from "next/server";
import { proxyProducts } from "@/lib/admin-products-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) { return proxyProducts(request, "/categories"); }
