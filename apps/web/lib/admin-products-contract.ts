export type ProductState = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type Option = { id: string; name: string; slug: string };
export type ProductOptions = { categories: Option[]; collections: Option[] };
export type ProductPhoto = { id: string; url: string; alt: string; position: number };
export type ProductVariant = {
  id: string; sku: string; size: string; color: string; colorHex: string | null;
  pricePaise: number; mrpPaise: number; weightGrams: number | null; active: boolean;
  images: ProductPhoto[];
  inventory: { onHand: number; reserved: number; safetyStock: number; reorderLevel: number } | null;
};
export type ProductRecord = {
  id: string; internalCode: string; internalName: string | null; name: string; slug: string; status: ProductState; categoryId: string | null;
  category: Option | null; shortDescription: string | null; description: string | null;
  fabric: string | null; care: string | null; updatedAt: string;
  images: ProductPhoto[]; variants: ProductVariant[];
  collections: Array<{ collectionId: string; collection: Option }>;
};
export type ProductSummary = Pick<ProductRecord, "id" | "internalCode" | "name" | "slug" | "status" | "updatedAt"> & {
  category: string | null; variantCount: number; onHand: number; imageUrl: string | null; minPricePaise: number | null;
};
export type ProductList = { items: ProductSummary[]; total: number; page: number; pageSize: number };
export type ReceiveVariant = { variantId: string; productId: string; productName: string; sku: string; color: string; size: string; onHand: number; imageUrl: string | null; photoCount: number };
export function receiveVariants(product: ProductRecord): ReceiveVariant[] {
  return product.variants.filter(v => v.active).map(v => ({
    variantId: v.id, productId: product.id, productName: product.name, sku: v.sku, color: v.color, size: v.size,
    onHand: v.inventory?.onHand ?? 0, imageUrl: v.images[0]?.url ?? product.images[0]?.url ?? null, photoCount: v.images.length,
  }));
}
export function appendNewReceiptLines<T extends { variantId: string }>(existing: T[], variants: ReceiveVariant[]): Array<T | (ReceiveVariant & { acceptedQuantity: string; rejectedQuantity: string; unitCostRupees: string })> {
  const ids = new Set(existing.map(line => line.variantId));
  const added = variants.filter(v => { if (ids.has(v.variantId)) return false; ids.add(v.variantId); return true; });
  return [...existing, ...added.map(v => ({ ...v, acceptedQuantity: "", rejectedQuantity: "0", unitCostRupees: "" }))];
}
export function rupeesToPaise(value: string, label = "Price"): number {
  const s = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(s)) throw new Error(`${label}: enter a positive rupee amount with at most two decimal places.`);
  const [whole, fraction = ""] = s.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise) || paise < 1 || paise > 100_000_000) throw new Error(`${label} must be between ₹0.01 and ₹10,00,000.`);
  return paise;
}
export function rupees(paise: number) { return (paise / 100).toFixed(2); }
export function money(paise: number | null) { return paise == null ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100); }
export function productSlug(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, ""); }
