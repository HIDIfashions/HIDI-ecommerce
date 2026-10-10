import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import {
  canonical, identifier, makeSku, MAX_VARIANTS, only, parseAddVariants, parseCreate, parseEdit,
  parseStatus, parseVariantEdit, parseDelete, parseDeleteCleanup, productMediaKeys, isDeletedProduct, deletedProductPredicate, DELETED_PRODUCT_SLUG_PREFIX, ProductInputError, record, slugify, text,
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
function internalBarcode(variantId: string) {
  const token = variantId.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase().padStart(12, "0");
  return `H${token}`;
}
function barcodeSuffix(query: string) {
  const normalized = query.trim().toUpperCase();
  return /^H[A-Z0-9]{12}$/.test(normalized) ? normalized.slice(1).toLowerCase() : null;
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
    const search: Prisma.ProductWhereInput[] = query ? [
      { name: { contains: query } },
      { slug: { contains: query } },
      { variants: { some: { sku: { contains: query } } } },
    ] : [];
    const suffix = barcodeSuffix(query);
    if (suffix) search.push({ variants: { some: { id: { endsWith: suffix } } } });
    const where: Prisma.ProductWhereInput = {
      ...(status && status !== "ALL" ? { status } : {}),
      NOT: deletedProductPredicate(),
      ...(query ? { OR: search } : {}),
    };
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({ where, include: detailInclude, skip: (page - 1) * 20, take: 20, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] }),
      this.prisma.product.count({ where }),
    ]);
    return {
      page, pageSize: 20, total,
      items: products.map(p => ({
        id: p.id, name: p.name, slug: p.slug, status: p.status, category: p.category?.name ?? null,
        updatedAt: p.updatedAt, variantCount: p.variants.length,
        onHand: p.variants.reduce((n, v) => n + (v.inventory?.onHand ?? 0), 0),
        imageUrl: p.images[0]?.url ?? p.variants.find(v => v.images.length)?.images[0]?.url ?? null,
        minPricePaise: p.variants.length ? Math.min(...p.variants.map(v => v.pricePaise)) : null,
      })),
    };
  }

  async priceTags(q?: string, status?: string, stock?: string, productIdValue?: string) {
    const query = input(v => text(v, "Search", 160), q) ?? "";
    if (status && !["ALL", "DRAFT", "ACTIVE", "ARCHIVED"].includes(status)) throw new BadRequestException("Invalid status filter.");
    if (stock && !["ALL", "IN_STOCK"].includes(stock)) throw new BadRequestException("Invalid stock filter.");
    const productId = productIdValue ? id(productIdValue) : undefined;
    const productFilter: Prisma.ProductWhereInput = {
      ...(status && status !== "ALL" ? { status: status as "DRAFT" | "ACTIVE" | "ARCHIVED" } : {}),
    };
    const search: Prisma.ProductVariantWhereInput[] = query ? [
      { sku: { contains: query } },
      { color: { contains: query } },
      { size: { contains: query } },
      { product: { is: { name: { contains: query } } } },
      { product: { is: { slug: { contains: query } } } },
    ] : [];
    const suffix = barcodeSuffix(query);
    if (suffix) search.push({ id: { endsWith: suffix } });

    const rows = await this.prisma.productVariant.findMany({
      where: {
        active: true,
        ...(productId ? { productId } : {}),
        ...(stock === "IN_STOCK" ? { inventory: { is: { onHand: { gt: 0 } } } } : {}),
        product: { is: productFilter },
        ...(query ? { OR: search } : {}),
      },
      select: {
        id: true, productId: true, sku: true, size: true, color: true,
        pricePaise: true, mrpPaise: true,
        bustMm: true, waistMm: true, hipMm: true, shoulderMm: true,
        sleeveLengthMm: true, garmentLengthMm: true,
        inventory: { select: { onHand: true, reserved: true } },
        product: { select: {
          name: true, status: true, fabric: true, care: true,
          category: { select: { name: true } },
        } },
      },
      orderBy: [{ productId: "asc" }, { color: "asc" }, { size: "asc" }, { sku: "asc" }],
      take: 5001,
    });
    const truncated = rows.length > 5000;
    const items = rows.slice(0, 5000).map(row => ({
      productId: row.productId,
      productName: row.product.name,
      productStatus: row.product.status,
      category: row.product.category?.name ?? null,
      fabric: row.product.fabric,
      care: row.product.care,
      variantId: row.id,
      barcode: internalBarcode(row.id),
      sku: row.sku,
      size: row.size,
      color: row.color,
      pricePaise: row.pricePaise,
      mrpPaise: row.mrpPaise,
      onHand: row.inventory?.onHand ?? 0,
      reserved: row.inventory?.reserved ?? 0,
      bustMm: row.bustMm,
      waistMm: row.waistMm,
      hipMm: row.hipMm,
      shoulderMm: row.shoulderMm,
      sleeveLengthMm: row.sleeveLengthMm,
      garmentLengthMm: row.garmentLengthMm,
    }));
    items.sort((left, right) => left.productName.localeCompare(right.productName, "en", { sensitivity: "base" })
      || left.color.localeCompare(right.color, "en", { sensitivity: "base" })
      || left.size.localeCompare(right.size, "en", { numeric: true, sensitivity: "base" })
      || left.sku.localeCompare(right.sku));
    return {
      items,
      total: items.length,
      productCount: new Set(items.map(item => item.productId)).size,
      totalOnHand: items.reduce((sum, item) => sum + item.onHand, 0),
      truncated,
    };
  }

  async get(productId: string) {
    const product = await this.find(this.prisma, id(productId));
    if (isDeletedProduct(product)) throw new NotFoundException("Product has been deleted.");
    return product;
  }

  async getDeletion(productId: string) {
    const product = await this.find(this.prisma, id(productId));
    if (!isDeletedProduct(product)) throw new ConflictException("This product has not been deleted.");
    const pendingMediaCount = product.images.length + product.variants.reduce((sum, variant) => sum + variant.images.length, 0);
    return { productId: product.id, name: product.name, status: "DELETED", updatedAt: product.updatedAt, pendingMediaCount, complete: pendingMediaCount === 0, historyPreserved: true };
  }

  private requireNotDeleted(product: ProductDetail) {
    if (isDeletedProduct(product)) throw new ConflictException("This product has been deleted. It cannot be edited or republished.");
  }

  /** Photo rows remain the durable cleanup queue until storage confirms each result. */
  private async deletionMedia(tx: DB, product: ProductDetail) {
    const media = [
      ...product.images.map(image => ({ kind: "product" as const, id: image.id, url: image.url, storagePath: null as string | null })),
      ...product.variants.flatMap(variant => variant.images.map(image => ({ kind: "variant" as const, id: image.id, url: image.url, storagePath: image.storagePath }))),
    ];
    const sharedUrls = new Set<string>();
    const sharedPaths = new Set<string>();
    const sharedKeys = new Set<string>();
    // Compare lightweight reference projections after decoding object keys. Filtering by
    // a raw URL can miss a shared object referenced through another CDN or percent encoding.
    if (media.length) {
      const [productImages, variantImages] = await Promise.all([
        tx.productImage.findMany({ where: { productId: { not: product.id }, product: { is: { NOT: deletedProductPredicate() } } }, select: { url: true } }),
        tx.productVariantImage.findMany({
          where: { variant: { is: { productId: { not: product.id }, product: { is: { NOT: deletedProductPredicate() } } } } },
          select: { url: true, storagePath: true },
        }),
      ]);
      for (const image of productImages) {
        sharedUrls.add(image.url);
        for (const key of productMediaKeys(image.url)) sharedKeys.add(key);
      }
      for (const image of variantImages) {
        sharedUrls.add(image.url);
        if (image.storagePath) sharedPaths.add(image.storagePath);
        for (const key of productMediaKeys(image.url, image.storagePath)) sharedKeys.add(key);
      }
    }
    return media.map(image => ({ ...image, shared: sharedUrls.has(image.url) || Boolean(image.storagePath && sharedPaths.has(image.storagePath)) || productMediaKeys(image.url, image.storagePath).some(key => sharedKeys.has(key)) }));
  }

  async beginDeletion(productId: string, value: unknown) {
    const data = input(parseDelete, value); const key = id(productId);
    return this.write(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Product" WITH (UPDLOCK, HOLDLOCK, ROWLOCK) WHERE "id" = ${key}`;
      let product = await this.find(tx, key);
      if (canonical(data.confirmName) !== canonical(product.name)) throw new BadRequestException("Type this product's name to confirm deletion.");
      const repeated = isDeletedProduct(product);
      if (!repeated && product.updatedAt.getTime() !== data.expectedUpdatedAt.getTime()) throw new ConflictException("This product changed after you opened it. Reload before deleting; nothing was deleted.");
      for (const variant of [...product.variants].sort((a, b) => a.id.localeCompare(b.id))) {
        const inventory = await tx.$queryRaw<Array<{ reserved: number }>>`SELECT "reserved" FROM "Inventory" WITH (UPDLOCK, HOLDLOCK, ROWLOCK) WHERE "variantId" = ${variant.id}`;
        if (inventory.some(row => row.reserved > 0)) throw new ConflictException("This product has reserved pieces. Complete or release those checkouts before deleting it.");
      }
      if (await tx.inventoryReservation.count({ where: { variant: { is: { productId: key } }, status: "ACTIVE" } })) throw new ConflictException("This product has an active checkout. Complete or release it before deleting the product.");
      if (await tx.adminMediaUploadTicket.count({ where: { variant: { is: { productId: key } }, expiresAt: { gt: new Date() }, usedAt: null } })) throw new ConflictException("A photo upload recently started for this product. Wait for its five-minute authorization to expire, then retry deletion.");
      if (!repeated) {
        await tx.productVariant.updateMany({ where: { productId: key }, data: { active: false } });
        await tx.cartItem.deleteMany({ where: { productId: key } });
        product = await tx.product.update({ where: { id: key }, data: { status: "ARCHIVED", slug: DELETED_PRODUCT_SLUG_PREFIX + Buffer.from(product.id, "utf8").toString("hex"), updatedAt: versionTime(product.updatedAt) }, include: detailInclude });
      }
      return {
        productId: key, name: product.name, status: "DELETED", updatedAt: product.updatedAt,
        historyPreserved: true, repeated, media: await this.deletionMedia(tx, product),
      };
    });
  }

  async finishDeletionCleanup(productId: string, value: unknown) {
    const data = input(parseDeleteCleanup, value); const key = id(productId);
    return this.write(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Product" WITH (UPDLOCK, HOLDLOCK, ROWLOCK) WHERE "id" = ${key}`;
      const product = await this.find(tx, key);
      if (!isDeletedProduct(product)) throw new ConflictException("Delete the product before confirming its photo cleanup.");
      const productIds = new Set(product.images.map(image => image.id));
      const variantIds = new Set(product.variants.flatMap(variant => variant.images.map(image => image.id)));
      // Missing IDs are successful replays; IDs belonging to another product are denied.
      const [foreignProductImages, foreignVariantImages] = await Promise.all([
        tx.productImage.count({ where: { id: { in: data.productImageIds }, productId: { not: key } } }),
        tx.productVariantImage.count({ where: { id: { in: data.variantImageIds }, variant: { is: { productId: { not: key } } } } }),
      ]);
      if (foreignProductImages || foreignVariantImages) throw new BadRequestException("Photo cleanup identifiers must belong to the deleted product.");
      const [products, variants] = await Promise.all([
        tx.productImage.deleteMany({ where: { productId: key, id: { in: data.productImageIds.filter(value => productIds.has(value)) } } }),
        tx.productVariantImage.deleteMany({ where: { variant: { is: { productId: key } }, id: { in: data.variantImageIds.filter(value => variantIds.has(value)) } } }),
      ]);
      const pendingMediaCount = productIds.size + variantIds.size - products.count - variants.count;
      return { productId: key, status: "DELETED", removedMetadataCount: products.count + variants.count, pendingMediaCount, complete: pendingMediaCount === 0, historyPreserved: true };
    });
  }

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
    await tx.$queryRaw`SELECT "id" FROM "Product" WITH (UPDLOCK, HOLDLOCK, ROWLOCK) WHERE "id" = ${productId} `;
    const product = await this.find(tx, productId);
    this.requireNotDeleted(product);
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
      this.requireNotDeleted(p);
      if (!this.sameCreation(p, data)) throw new ConflictException("This request already created a product. Find it in Products before starting another creation.");
      return p;
    };
    const previous = await replay();
    if (previous) return previous;
    try {
      return await this.write(async tx => {
        await this.references(tx, data);
        return tx.product.create({ data: {
          id: productId, ...fields(data), slug: data.slug, status: "DRAFT",
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
