import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import {
  canonical, identifier, makeSku, MAX_VARIANTS, only, parseAddVariants, parseCreate, parseEdit,
  parseStatus, parseVariantEdit, ProductInputError, record, slugify, text,
  type MatrixInput, type ProductFields,
} from "./product-input.js";

const detailInclude = {
  category: true,
  collections: { include: { collection: true } },
  images: { orderBy: { position: "asc" as const } },
  variants: {
    include: { inventory: true, images: { orderBy: { position: "asc" as const } } },
    orderBy: [{ color: "asc" as const }, { size: "asc" as const }],
  },
} satisfies Prisma.ProductInclude;
type ProductDetail = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;
type DB = Prisma.TransactionClient;
function code(error: unknown) { return error && typeof error === "object" && "code" in error ? String(error.code) : ""; }
function input<T>(parse: (data: unknown) => T, data: unknown): T {
  try { return parse(data); } catch (e) { if (e instanceof ProductInputError) throw new BadRequestException(e.message); throw e; }
}
function id(value: unknown) { return input(identifier, value); }
function fields(data: ProductFields) {
  const { name, categoryId, shortDescription, description, fabric, care } = data;
  return { name, categoryId, shortDescription, description, fabric, care };
}
function versionTime(previous: Date) { return new Date(Math.max(Date.now(), previous.getTime() + 1)); }
async function nextInternalCode(tx: DB) {
  const rows = await tx.$queryRaw<Array<{ value: bigint }>>`
    SELECT nextval('hidi_product_code_seq') AS value
  `;
  const value = Number(rows[0]?.value ?? 0);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Unable to allocate HIDI product number");
  return "HIDI-" + String(value).padStart(6, "0");
}

@Injectable()
export class AdminProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async options() {
    const [categories, collections] = await Promise.all([
      this.prisma.category.findMany({ where: { active: true }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true, slug: true } }),
      this.prisma.collection.findMany({ where: { active: true }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true, slug: true } }),
    ]);
    return { categories, collections };
  }

  async createCategory(value: unknown) {
    const data = input(v => {
      const r = record(v); only(r, ["name"]);
      const name = text(r.name, "Category name", 80, true)!;
      const slug = slugify(name);
      if (!slug) throw new ProductInputError("Use an English category name.");
      return { name, slug };
    }, value);
    try { return await this.prisma.category.create({ data }); }
    catch (e) { if (code(e) === "P2002") throw new ConflictException("A category with that name/URL already exists. Refresh the list."); throw e; }
  }

  async list(q?: string, status?: string, pageValue?: string) {
    const query = input(v => text(v, "Search", 160), q) ?? "";
    if (status && !["ALL", "DRAFT", "ACTIVE", "ARCHIVED"].includes(status)) throw new BadRequestException("Invalid status filter.");
    const page = Number(pageValue ?? "1");
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new BadRequestException("Invalid page.");
    const where: Prisma.ProductWhereInput = {
      ...(status && status !== "ALL" ? { status: status as "DRAFT" | "ACTIVE" | "ARCHIVED" } : {}),
      ...(query ? { OR: [
        { name: { contains: query, mode: "insensitive" } },
        { internalCode: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
        { variants: { some: { sku: { contains: query, mode: "insensitive" } } } },
      ] } : {}),
    };
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({ where, include: detailInclude, skip: (page - 1) * 20, take: 20, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] }),
      this.prisma.product.count({ where }),
    ]);
    return {
      page, pageSize: 20, total,
      items: products.map(p => ({
        id: p.id, internalCode: p.internalCode, name: p.name, slug: p.slug, status: p.status, category: p.category?.name ?? null,
        updatedAt: p.updatedAt, variantCount: p.variants.length,
        onHand: p.variants.reduce((n, v) => n + (v.inventory?.onHand ?? 0), 0),
        imageUrl: p.images[0]?.url ?? p.variants.find(v => v.images.length)?.images[0]?.url ?? null,
        minPricePaise: p.variants.length ? Math.min(...p.variants.map(v => v.pricePaise)) : null,
      })),
    };
  }

  get(productId: string) { return this.find(this.prisma, id(productId)); }

  private async find(db: Pick<DB, "product">, productId: string) {
    const product = await db.product.findUnique({ where: { id: productId }, include: detailInclude });
    if (!product) throw new NotFoundException("Product not found.");
    return product;
  }

  private async references(tx: DB, data: ProductFields) {
    if (data.categoryId && !await tx.category.findFirst({ where: { id: data.categoryId, active: true } })) throw new BadRequestException("Select an active category.");
    if (data.collectionIds.length) {
      const count = await tx.collection.count({ where: { id: { in: data.collectionIds }, active: true } });
      if (count !== data.collectionIds.length) throw new BadRequestException("One or more collections are no longer active. Refresh the form.");
    }
  }

  private async write<T>(operation: (tx: DB) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 });
      } catch (e) {
        if (code(e) === "P2034") {
          if (attempt < 2) continue;
          throw new ConflictException("Another update is in progress. Reload this product and try again.");
        }
        throw e;
      }
    }
    throw new ConflictException("Unable to save; reload and try again.");
  }

  private async locked(tx: DB, productId: string, expected: Date) {
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
    const product = await this.find(tx, productId);
    if (product.updatedAt.getTime() !== expected.getTime()) throw new ConflictException("This product changed after you opened it. Reload the product before saving; your changes were not applied.");
    return product;
  }

  private newVariants(productId: string, slug: string, data: MatrixInput) {
    return data.colors.flatMap(color => data.sizes.map(size => ({
      sku: makeSku(productId, slug, color.name, size), size, color: color.name, colorHex: color.hex,
      pricePaise: data.pricePaise, mrpPaise: data.mrpPaise, weightGrams: data.weightGrams, active: true,
      inventory: { create: { onHand: 0, reserved: 0, safetyStock: 0, reorderLevel: 5 } },
    })));
  }

  private sameCreation(product: ProductDetail, data: ReturnType<typeof parseCreate>): boolean {
    if (Object.entries(fields(data)).some(([k, v]) => product[k as keyof typeof fieldsResult] !== v)) return false;
    if (product.slug !== data.slug) return false;
    if (JSON.stringify(product.collections.map(c => c.collectionId).sort()) !== JSON.stringify([...data.collectionIds].sort())) return false;
    const expected = this.newVariants(product.id, product.slug, data);
    return expected.length === product.variants.length && expected.every(v => product.variants.some(p =>
      canonical(p.color) === canonical(v.color) && canonical(p.size) === canonical(v.size) &&
      p.pricePaise === v.pricePaise && p.mrpPaise === v.mrpPaise && p.weightGrams === v.weightGrams && p.colorHex === v.colorHex));
  }

  async create(value: unknown) {
    const data = input(parseCreate, value);
    // Idempotency for a retried creation request without adding a DB table or mutating stock.
    const productId = `pm_${data.requestId.replace(/-/g, "")}`;
    const replay = async () => {
      const p = await this.prisma.product.findUnique({ where: { id: productId }, include: detailInclude });
      if (!p) return null;
      if (!this.sameCreation(p, data)) throw new ConflictException("This request already created a product. Find it in Products before starting another creation.");
      return p;
    };
    const previous = await replay();
    if (previous) return previous;
    try {
      return await this.write(async tx => {
        await this.references(tx, data);
        const internalCode = await nextInternalCode(tx);
        return tx.product.create({ data: {
          id: productId, internalCode, ...fields(data), slug: data.slug, status: "DRAFT",
          collections: { create: data.collectionIds.map(collectionId => ({ collectionId })) },
          variants: { create: this.newVariants(productId, data.slug, data) },
        }, include: detailInclude });
      });
    } catch (e) {
      if (code(e) === "P2002") {
        const saved = await replay();
        if (saved) return saved;
        throw new ConflictException("A product URL or SKU already exists. Search Products, or choose a different product URL.");
      }
      throw e;
    }
  }

  async edit(productId: string, value: unknown) {
    const data = input(parseEdit, value); const key = id(productId);
    return this.write(async tx => {
      const current = await this.locked(tx, key, data.expectedUpdatedAt);
      await this.references(tx, data);
      return tx.product.update({ where: { id: key }, data: {
        ...fields(data), updatedAt: versionTime(current.updatedAt),
        collections: { deleteMany: {}, create: data.collectionIds.map(collectionId => ({ collectionId })) },
      }, include: detailInclude });
    });
  }

  async addVariants(productId: string, value: unknown) {
    const data = input(parseAddVariants, value); const key = id(productId);
    try {
      return await this.write(async tx => {
        const current = await this.locked(tx, key, data.expectedUpdatedAt);
        if (current.status === "ARCHIVED") throw new BadRequestException("Move this product back to Draft before adding variants.");
        const existing = new Set(current.variants.map(v => `${canonical(v.color)}\0${canonical(v.size)}`));
        const proposed = this.newVariants(key, current.slug, data).filter(v => !existing.has(`${canonical(v.color)}\0${canonical(v.size)}`));
        if (!proposed.length) throw new ConflictException("All selected colour/size combinations already exist. No stock or variants changed.");
        if (current.variants.length + proposed.length > MAX_VARIANTS) throw new BadRequestException(`At most ${MAX_VARIANTS} variants per product.`);
        for (const v of proposed) {
          // Reuse the existing spelling/hex and colour photos for another size of that colour.
          const sibling = current.variants.find(row => canonical(row.color) === canonical(v.color));
          const color = sibling?.color ?? v.color;
          const colorHex = sibling?.colorHex ?? v.colorHex;
          const imageSource = current.variants.find(row => canonical(row.color) === canonical(color) && row.images.length)?.images ?? [];
          await tx.productVariant.create({ data: {
            ...v, productId: key, color, colorHex,
            images: { create: imageSource.map(photo => ({ url: photo.url, alt: photo.alt, position: photo.position })) },
          } });
        }
        return tx.product.update({ where: { id: key }, data: { updatedAt: versionTime(current.updatedAt) }, include: detailInclude });
      });
    } catch (e) {
      if (code(e) === "P2002") throw new ConflictException("A variant with this colour/size or SKU already exists. Refresh before retrying.");
      throw e;
    }
  }

  async editVariant(productId: string, variantId: string, value: unknown) {
    const data = input(parseVariantEdit, value); const key = id(productId); const variantKey = id(variantId);
    return this.write(async tx => {
      const current = await this.locked(tx, key, data.expectedUpdatedAt);
      const variant = current.variants.find(v => v.id === variantKey);
      if (!variant) throw new NotFoundException("Variant does not belong to this product.");
      if (!data.active && (variant.inventory?.reserved ?? 0) > 0) throw new ConflictException("This SKU has reserved pieces. Finish or release those checkouts before disabling it.");
      if (!data.active && current.status === "ACTIVE" && !current.variants.some(v => v.id !== variantKey && v.active)) throw new BadRequestException("Move the product to Draft before disabling its final active SKU.");
      const { expectedUpdatedAt: _expected, ...changes } = data;
      await tx.productVariant.update({ where: { id: variantKey }, data: changes });
      return tx.product.update({ where: { id: key }, data: { updatedAt: versionTime(current.updatedAt) }, include: detailInclude });
    });
  }

  async setStatus(productId: string, value: unknown) {
    const data = input(parseStatus, value); const key = id(productId);
    return this.write(async tx => {
      const current = await this.locked(tx, key, data.expectedUpdatedAt);
      if (data.status === "ACTIVE") {
        const active = current.variants.filter(v => v.active);
        if (!active.length) throw new BadRequestException("Add at least one active SKU before publishing.");
        if (active.some(v => v.pricePaise <= 0 || v.mrpPaise < v.pricePaise)) throw new BadRequestException("Correct variant selling prices and MRPs before publishing.");
        if (!current.images.length && !active.some(v => v.images.length)) throw new BadRequestException("Upload at least one product/SKU photo before publishing.");
      }
      if (current.status === data.status) return current;
      return tx.product.update({ where: { id: key }, data: { status: data.status, updatedAt: versionTime(current.updatedAt) }, include: detailInclude });
    });
  }
}
// Shape for the narrow metadata comparison used by idempotent create.
const fieldsResult = { name: "", categoryId: null as string | null, shortDescription: null as string | null, description: null as string | null, fabric: null as string | null, care: null as string | null };
