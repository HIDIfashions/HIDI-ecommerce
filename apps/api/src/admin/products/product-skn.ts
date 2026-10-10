import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";

type SknDatabase = Pick<Prisma.TransactionClient, "$queryRaw"> & Partial<Pick<PrismaClient, "$transaction">>;
type SknRow = { productId: string; skn: string };
const validSkn = (value: unknown): value is string => typeof value === "string" && /^[1-9]\d{4}$/.test(value);

function unavailable(cause?: unknown) {
  const error = cause && typeof cause === "object" ? cause as { message?: unknown; meta?: { code?: unknown; message?: unknown }; cause?: { number?: unknown; originalCode?: unknown; message?: unknown } } : {};
  const message = [error.message, error.meta?.code, error.meta?.message, error.cause?.number, error.cause?.originalCode, error.cause?.message].map(value => String(value ?? "")).join(" ");
  return new ServiceUnavailableException(/11728|exhaust/i.test(message)
    ? "The five-digit product SKN range is exhausted. Contact the administrator before importing more products."
    : "Product SKN mapping is not ready. Contact the administrator before importing products.", { cause });
}

function code(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "";
}

async function serializable<T>(db: SknDatabase, operation: (tx: SknDatabase) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // A TransactionClient has no $transaction; reuse its surrounding write.
      return db.$transaction
        ? await db.$transaction(tx => operation(tx), { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 })
        : await operation(db);
    } catch (error) {
      if (code(error) === "P2034") {
        if (db.$transaction && attempt < 2) continue;
        throw error; // The product write wrapper owns retries for an existing TX.
      }
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException) throw error;
      throw unavailable(error);
    }
  }
  throw unavailable();
}

function validRow(rows: SknRow[], productId: string): string {
  if (rows.length !== 1 || rows[0].productId !== productId || !validSkn(rows[0].skn)) throw unavailable();
  return rows[0].skn;
}

async function allocate(tx: SknDatabase, productId: string): Promise<string> {
  // The retained Product table has no new trigger, so Prisma INSERT OUTPUT stays
  // compatible. Only an actual existing product can receive a reserved number.
  const products = await tx.$queryRaw<Array<{ id: string }>>`SELECT [id] FROM [dbo].[Product] WITH (UPDLOCK, HOLDLOCK) WHERE [id] = ${productId}`;
  if (products.length !== 1 || products[0].id !== productId) throw new NotFoundException("Product not found. SKN was not assigned.");
  const existing = await tx.$queryRaw<SknRow[]>`SELECT [productId], [skn] FROM [dbo].[HidiProductSKN] WITH (UPDLOCK, HOLDLOCK) WHERE [productId] = ${productId}`;
  if (existing.length) return validRow(existing, productId);
  const created = await tx.$queryRaw<SknRow[]>`INSERT INTO [dbo].[HidiProductSKN] ([productId]) OUTPUT INSERTED.[productId], INSERTED.[skn] VALUES (${productId})`;
  return validRow(created, productId);
}

/** Reserve a stable number using the SQL sequence default, inside the product transaction. */
export async function ensureProductSkn(db: SknDatabase, productId: string): Promise<string> {
  return serializable(db, tx => allocate(tx, productId));
}

async function readMap(tx: SknDatabase, productIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(productIds)];
  const result = new Map<string, string>();
  // SQL Server has a 2,100-parameter limit; inventory callers may supply many products.
  for (let start = 0; start < ids.length; start += 1000) {
    const batch = ids.slice(start, start + 1000);
    // Existing numbers are immutable. Do not retain a shared missing-key range
    // lock before taking the Product→mapping update locks used by allocation.
    const rows = await tx.$queryRaw<SknRow[]>`SELECT [productId], [skn] FROM [dbo].[HidiProductSKN] WITH (READCOMMITTEDLOCK) WHERE [productId] IN (${Prisma.join(batch)})`;
    for (const row of rows) {
      if (!batch.includes(row.productId) || !validSkn(row.skn) || result.has(row.productId)) throw unavailable();
      result.set(row.productId, row.skn);
    }
  }
  // This also covers a legacy container creating a product between additive
  // backfill and rollout. Validate and reserve only missing real Product rows.
  for (const productId of ids.filter(value => !result.has(value)).sort()) result.set(productId, await allocate(tx, productId));
  return result;
}

export async function productSknMap(db: SknDatabase, productIds: readonly string[]): Promise<Map<string, string>> {
  if (!productIds.length) return new Map();
  return serializable(db, tx => readMap(tx, productIds));
}
export async function withProductSkn<T extends { id: string }>(db: SknDatabase, product: T): Promise<T & { skn: string }> {
  const mapping = await productSknMap(db, [product.id]);
  return { ...product, skn: mapping.get(product.id)! };
}

/** A five-digit lookup is exact and parameterized, independent of product names or prices. */
export async function productIdForSkn(db: SknDatabase, skn: string): Promise<string | null> {
  if (!validSkn(skn)) return null;
  try {
    const rows = await db.$queryRaw<SknRow[]>`SELECT [productId], [skn] FROM [dbo].[HidiProductSKN] WHERE [skn] = ${skn}`;
    if (rows.length > 1 || rows.some(row => row.skn !== skn || !row.productId)) throw unavailable();
    return rows[0]?.productId ?? null;
  } catch (error) {
    if (error instanceof ServiceUnavailableException) throw error;
    throw unavailable(error);
  }
}
