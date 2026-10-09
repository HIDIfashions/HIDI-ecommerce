import { PackingScannerClient } from "./packing-scanner-client";

export const dynamic = "force-dynamic";

export default async function PackingScannerPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const params = await searchParams;
  return <PackingScannerClient initialOrderNumber={params.order?.trim() ?? ""} />;
}
