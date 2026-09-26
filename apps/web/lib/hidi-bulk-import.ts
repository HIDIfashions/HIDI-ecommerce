import type { ProductRecord, ProductVariant } from "@/lib/admin-products-contract";
import { productSlug, rupeesToPaise } from "@/lib/admin-products-contract";
import type { SheetRow } from "@/lib/hidi-spreadsheet";

export type BulkProductMode = "NEW" | "STOCK";
export type BulkProductRow = {
  rowNumber: number;
  mode: BulkProductMode;
  productName: string;
  productSlug: string;
  category: string;
  shortDescription: string;
  description: string;
  fabric: string;
  care: string;
  color: string;
  colorHex: string;
  size: string;
  sellingPrice: string;
  mrp: string;
  weightGrams: string;
  openingQty: number;
  sku: string;
  errors: string[];
};
export type ReceiptCsvRow = { rowNumber: number; sku: string; acceptedQuantity: string; rejectedQuantity: string; unitCostRupees: string; errors: string[] };
export type InventoryRowLite = { variantId: string; productName: string; sku: string; color: string; size: string; onHand: number; imageUrl?: string | null; photoCount?: number };

function take(row: SheetRow, ...names: string[]) {
  for (const name of names) if (row[name] !== undefined) return row[name].trim();
  return "";
}
function whole(value: string, label: string, min = 0, max = 1_000_000) {
  if (!value) return 0;
  if (!/^\d+$/.test(value)) throw new Error(`${label} must be a whole number.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`${label} must be ${min}–${max}.`);
  return number;
}
function canonical(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(); }
export function comboKey(color: string, size: string) { return `${canonical(color)}\u0000${canonical(size)}`; }
export function skuKey(value: string) { return value.normalize("NFKC").trim().toUpperCase(); }

export function normalizeProductRows(sheet: SheetRow[]): BulkProductRow[] {
  const rows = sheet.map((raw, index) => {
    const productName = take(raw, "product_name", "product");
    const sku = take(raw, "sku");
    const explicitMode = take(raw, "mode").toUpperCase();
    const mode: BulkProductMode = explicitMode === "STOCK" || (!productName && sku) ? "STOCK" : "NEW";
    const row: BulkProductRow = {
      rowNumber: index + 2, mode, productName,
      productSlug: take(raw, "product_slug", "slug") || productSlug(productName),
      category: take(raw, "category"), shortDescription: take(raw, "short_description", "short_desc"),
      description: take(raw, "description"), fabric: take(raw, "fabric"), care: take(raw, "care", "wash_care"),
      color: take(raw, "color", "colour"), colorHex: take(raw, "color_hex", "colour_hex"), size: take(raw, "size").toUpperCase(),
      sellingPrice: take(raw, "selling_price", "price"), mrp: take(raw, "mrp"), weightGrams: take(raw, "weight_grams", "weight"),
      openingQty: 0, sku, errors: [],
    };
    try { row.openingQty = whole(take(raw, "opening_qty", "quantity", "qty"), "Opening quantity"); } catch (e) { row.errors.push(e instanceof Error ? e.message : "Invalid opening quantity."); }
    if (mode === "STOCK") {
      if (!sku) row.errors.push("SKU is required for STOCK rows.");
      if (row.openingQty < 1) row.errors.push("STOCK rows need an opening quantity greater than zero.");
    } else {
      if (!productName) row.errors.push("Product name is required.");
      if (!row.productSlug) row.errors.push("Product slug could not be generated. Use an English product name or enter product_slug.");
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.productSlug) || row.productSlug.length > 100) row.errors.push("Product slug must use lowercase letters, numbers and hyphens.");
      if (!row.color) row.errors.push("Colour is required.");
      if (!row.size) row.errors.push("Size is required.");
      if (sku) row.errors.push("Leave SKU blank for NEW rows; HIDI generates the SKU. Use STOCK mode for an existing SKU.");
      if (row.colorHex && !/^#[0-9a-fA-F]{6}$/.test(row.colorHex)) row.errors.push("Colour hex must look like #800000.");
      try { const price = rupeesToPaise(row.sellingPrice, "Selling price"); const mrp = rupeesToPaise(row.mrp, "MRP"); if (price > mrp) row.errors.push("Selling price cannot exceed MRP."); } catch (e) { row.errors.push(e instanceof Error ? e.message : "Invalid price."); }
      if (row.weightGrams) try { whole(row.weightGrams, "Weight", 1, 100000); } catch (e) { row.errors.push(e instanceof Error ? e.message : "Invalid weight."); }
    }
    return row;
  });
  const productShape = new Map<string, { row: number; name: string; category: string; shortDescription: string; fabric: string; care: string }>();
  for (const row of rows) if (row.mode === "NEW" && row.productSlug) {
    const existing = productShape.get(row.productSlug);
    const shape = { row: row.rowNumber, name: canonical(row.productName), category: canonical(row.category), shortDescription: canonical(row.shortDescription), fabric: canonical(row.fabric), care: canonical(row.care) };
    if (!existing) productShape.set(row.productSlug, shape);
    else if (existing.name !== shape.name || existing.category !== shape.category || existing.shortDescription !== shape.shortDescription || existing.fabric !== shape.fabric || existing.care !== shape.care) row.errors.push(`Product-level fields differ from row ${existing.row} for the same product_slug.`);
  }
  const combinations = new Map<string, number>(); const stockSkus = new Map<string, number>();
  for (const row of rows) {
    if (row.mode === "NEW") {
      const key = `${row.productSlug}\u0000${comboKey(row.color, row.size)}`;
      if (combinations.has(key)) { row.errors.push(`Duplicate product/colour/size; first seen on row ${combinations.get(key)}.`); }
      else combinations.set(key, row.rowNumber);
    } else {
      const key = skuKey(row.sku);
      if (stockSkus.has(key)) row.errors.push(`Duplicate STOCK SKU; first seen on row ${stockSkus.get(key)}.`);
      else stockSkus.set(key, row.rowNumber);
    }
  }
  return rows;
}

export function normalizeReceiptRows(sheet: SheetRow[]): ReceiptCsvRow[] {
  const rows = sheet.map((raw, index) => {
    const row: ReceiptCsvRow = { rowNumber: index + 2, sku: take(raw, "sku"), acceptedQuantity: take(raw, "accepted_qty", "accepted_quantity", "quantity", "qty"), rejectedQuantity: take(raw, "rejected_qty", "rejected_quantity") || "0", unitCostRupees: take(raw, "unit_cost", "unit_cost_rupees", "cost"), errors: [] };
    if (!row.sku) row.errors.push("SKU is required.");
    try { whole(row.acceptedQuantity, "Accepted quantity", 0, 100000); } catch (e) { row.errors.push(e instanceof Error ? e.message : "Invalid accepted quantity."); }
    try { whole(row.rejectedQuantity, "Rejected quantity", 0, 100000); } catch (e) { row.errors.push(e instanceof Error ? e.message : "Invalid rejected quantity."); }
    try { rupeesToPaise(row.unitCostRupees, "Unit cost"); } catch (e) { row.errors.push(e instanceof Error ? e.message : "Invalid unit cost."); }
    if (row.acceptedQuantity === "0" && row.rejectedQuantity === "0") row.errors.push("Enter accepted or rejected quantity.");
    return row;
  });
  const seen = new Map<string, number>();
  for (const row of rows) { const key = skuKey(row.sku); if (seen.has(key)) row.errors.push(`Duplicate SKU; first seen on row ${seen.get(key)}.`); else seen.set(key, row.rowNumber); }
  return rows;
}

export function variantFor(product: ProductRecord, color: string, size: string): ProductVariant | undefined {
  const key = comboKey(color, size); return product.variants.find(v => comboKey(v.color, v.size) === key);
}

export async function sha256Text(text: string) {
  const bytes = new TextEncoder().encode(text); const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, "0")).join("");
}
