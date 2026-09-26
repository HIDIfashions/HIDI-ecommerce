/** Pure input validation. No implicit coercion, no inventory quantities accepted. */
export class ProductInputError extends Error {}
export const MAX_VARIANTS = 200;
export type ProductState = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type Colour = { name: string; hex: string | null };
export type MatrixInput = { colors: Colour[]; sizes: string[]; pricePaise: number; mrpPaise: number; weightGrams: number | null };
export type ProductFields = {
  name: string; categoryId: string | null; collectionIds: string[];
  shortDescription: string | null; description: string | null; fabric: string | null; care: string | null;
};
type RecordInput = Record<string, unknown>;
export function record(value: unknown): RecordInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProductInputError("A JSON object is required.");
  return value as RecordInput;
}
export function only(input: RecordInput, keys: string[]) {
  for (const key of Object.keys(input)) if (!keys.includes(key)) throw new ProductInputError(`Unsupported field: ${key}.`);
}
export function text(value: unknown, label: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ProductInputError(`${label} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new ProductInputError(`${label} must be text.`);
  const result = value.normalize("NFKC").trim();
  if (result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) throw new ProductInputError(`${label} is too long or contains invalid characters.`);
  if (required && !result) throw new ProductInputError(`${label} is required.`);
  return result || null;
}
export function identifier(value: unknown, label = "Identifier"): string {
  const result = text(value, label, 100, true)!;
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new ProductInputError(`${label} is invalid.`);
  return result;
}
export function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new ProductInputError(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}
export function canonical(value: string): string { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(); }
export function slugify(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const fieldKeys = ["name", "categoryId", "collectionIds", "shortDescription", "description", "fabric", "care"];
const matrixKeys = ["colors", "sizes", "pricePaise", "mrpPaise", "weightGrams"];
function fields(input: RecordInput): ProductFields {
  const raw = input.collectionIds ?? [];
  if (!Array.isArray(raw) || raw.length > 20) throw new ProductInputError("Choose up to 20 collections.");
  return {
    name: text(input.name, "Product name", 160, true)!,
    categoryId: input.categoryId ? identifier(input.categoryId, "Category") : null,
    collectionIds: [...new Set(raw.map(value => identifier(value, "Collection")))],
    shortDescription: text(input.shortDescription, "Short description", 400),
    description: text(input.description, "Description", 10000),
    fabric: text(input.fabric, "Fabric", 300),
    care: text(input.care, "Wash care", 2000),
  };
}
export function prices(input: RecordInput) {
  const pricePaise = integer(input.pricePaise, "Selling price (paise)", 1, 100_000_000);
  const mrpPaise = integer(input.mrpPaise, "MRP (paise)", 1, 100_000_000);
  if (pricePaise > mrpPaise) throw new ProductInputError("Selling price cannot exceed MRP.");
  const weightGrams = input.weightGrams == null ? null : integer(input.weightGrams, "Weight (grams)", 1, 100000);
  return { pricePaise, mrpPaise, weightGrams };
}
export function matrix(input: RecordInput): MatrixInput {
  if (!Array.isArray(input.colors) || input.colors.length < 1 || input.colors.length > 20) throw new ProductInputError("Choose 1–20 colours.");
  if (!Array.isArray(input.sizes) || input.sizes.length < 1 || input.sizes.length > 15) throw new ProductInputError("Choose 1–15 sizes.");
  const colors = input.colors.map(value => {
    const c = record(value); only(c, ["name", "hex"]);
    const name = text(c.name, "Colour", 40, true)!.replace(/\s+/g, " ");
    const hex = text(c.hex, "Colour hex", 7);
    if (hex && !/^#[0-9a-fA-F]{6}$/.test(hex)) throw new ProductInputError("Colour hex must look like #800000.");
    // An ASCII token makes the generated SKU deterministic and readable.
    if (!slugify(name)) throw new ProductInputError("Use an English colour name for SKU generation.");
    return { name, hex: hex?.toUpperCase() ?? null };
  });
  const sizes = input.sizes.map(value => text(value, "Size", 20, true)!.replace(/\s+/g, " ").toUpperCase());
  if (sizes.some(s => !slugify(s))) throw new ProductInputError("Use letters or numbers for sizes.");
  if (new Set(colors.map(c => canonical(c.name))).size !== colors.length || new Set(colors.map(c => slugify(c.name))).size !== colors.length) throw new ProductInputError("Duplicate colours are not allowed.");
  if (new Set(sizes.map(slugify)).size !== sizes.length) throw new ProductInputError("Duplicate sizes are not allowed.");
  if (colors.length * sizes.length > MAX_VARIANTS) throw new ProductInputError(`At most ${MAX_VARIANTS} variants per product.`);
  return { colors, sizes, ...prices(input) };
}
export function parseCreate(value: unknown) {
  const input = record(value); only(input, [...fieldKeys, ...matrixKeys, "slug", "requestId"]);
  const product = fields(input);
  const requestId = text(input.requestId, "Request ID", 36, true)!;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new ProductInputError("Invalid request ID. Reload the product form.");
  const slug = text(input.slug, "Product URL", 100) ?? slugify(product.name).slice(0, 80).replace(/-+$/, "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) throw new ProductInputError("Product URL must use lowercase English letters, numbers and hyphens.");
  return { ...product, ...matrix(input), slug, requestId: requestId.toLowerCase() };
}
export function revision(value: unknown): Date {
  const raw = text(value, "Product version", 40, true)!;
  const date = new Date(raw);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw) || !Number.isFinite(date.getTime())) throw new ProductInputError("Invalid product version. Reload before saving.");
  return date;
}
export function parseEdit(value: unknown) {
  const input = record(value); only(input, [...fieldKeys, "expectedUpdatedAt"]);
  return { ...fields(input), expectedUpdatedAt: revision(input.expectedUpdatedAt) };
}
export function parseAddVariants(value: unknown) {
  const input = record(value); only(input, [...matrixKeys, "expectedUpdatedAt"]);
  return { ...matrix(input), expectedUpdatedAt: revision(input.expectedUpdatedAt) };
}
export function parseVariantEdit(value: unknown) {
  const input = record(value); only(input, ["pricePaise", "mrpPaise", "weightGrams", "active", "expectedUpdatedAt"]);
  if (typeof input.active !== "boolean") throw new ProductInputError("Active must be true or false.");
  return { ...prices(input), active: input.active, expectedUpdatedAt: revision(input.expectedUpdatedAt) };
}
export function parseStatus(value: unknown) {
  const input = record(value); only(input, ["status", "expectedUpdatedAt"]);
  if (!["DRAFT", "ACTIVE", "ARCHIVED"].includes(String(input.status))) throw new ProductInputError("Invalid product status.");
  return { status: input.status as ProductState, expectedUpdatedAt: revision(input.expectedUpdatedAt) };
}
export function makeSku(productId: string, productSlug: string, color: string, size: string): string {
  // The product token plus untruncated colour/size tokens give readable identifiers.
  // Database uniqueness is authoritative; existing SKUs are never regenerated on edit.
  return `HIDI-${productSlug.slice(0, 22)}-${productId.replace(/[^a-zA-Z0-9]/g, "").slice(-12)}-${slugify(color)}-${slugify(size)}`.toUpperCase();
}
