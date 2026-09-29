import type { ApiProduct } from "./api";
const text = (value?: string | null) => value?.trim() || null;
/** Read explicitly labelled catalogue facts; never infer set contents from a photo or title. */
export function productFacts(product: ApiProduct) {
  const description = [product.description, product.shortDescription].filter(Boolean).join("\n");
  const label = (name: string) => text(description.match(new RegExp("(?:^|\\n)\\s*" + name + "\\s*:\\s*([^\\n]+)", "i"))?.[1]);
  return { fabric: text(product.fabric), care: text(product.care), includes: label("Includes"), fit: label("Fit"), lining: label("Lining"), model: label("Model") };
}
export function productContentGaps(product: ApiProduct): string[] {
  const facts = productFacts(product), gaps: string[] = [];
  if (!facts.fabric) gaps.push("Fabric composition");
  if (!facts.care) gaps.push("Care instructions");
  if (!facts.includes) gaps.push("Included pieces");
  if (!facts.fit) gaps.push("Fit description");
  if (!product.images?.length) gaps.push("Product photography");
  if (product.variants.some(v => v.available > 0 && (!(Number.isFinite(v.bustMm) && (v.bustMm ?? 0) > 0) || !(Number.isFinite(v.garmentLengthMm) && (v.garmentLengthMm ?? 0) > 0)))) gaps.push("Measurements for every available size");
  return gaps;
}

export function productNarrative(description?: string | null): string {
  return (description ?? "").split(/\r?\n/).filter(line => !/^\s*(?:Includes|Fit|Lining|Model)\s*:/i.test(line)).join("\n").trim();
}
