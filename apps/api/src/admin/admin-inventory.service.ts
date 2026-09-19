import { createHash, randomBytes, randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InventoryMovementType, Prisma, StockReceiptStatus } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

type InventoryStatus = "ALL" | "HEALTHY" | "LOW" | "OUT";
type AdjustmentOperation = "RECEIVE" | "REMOVE" | "SET";

export type AdjustInventoryInput = {
  operation: AdjustmentOperation;
  quantity: number;
  reason: InventoryMovementType;
  note?: string;
  reference?: string;
  safetyStock?: number;
  reorderLevel?: number;
};

export type StockReceiptInput = {
  supplierName?: string;
  invoiceNumber?: string;
  purchaseOrderNumber?: string;
  receivedAt?: string;
  note?: string;
  action?: "DRAFT" | "POST";
  lines?: Array<{
    variantId?: string;
    acceptedQuantity?: number;
    rejectedQuantity?: number;
    unitCostPaise?: number | null;
  }>;
};

export type VariantImageInput = {
  url?: string;
  storagePath?: string;
  alt?: string;
  applyToColor?: boolean;
};

export type VariantImageUploadTicketInput = {
  mimeType?: string;
  sizeBytes?: number;
};

@Injectable()
export class AdminInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query?: string, requestedStatus?: string) {
    const q = query?.trim();
    const status = this.normaliseStatus(requestedStatus);
    const variants = await this.prisma.productVariant.findMany({
      where: {
        inventory: { isNot: null },
        ...(q
          ? {
              OR: [
                { sku: { contains: q, mode: "insensitive" as const } },
                { product: { name: { contains: q, mode: "insensitive" as const } } },
                { color: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            images: { orderBy: { position: "asc" }, take: 1 },
          },
        },
        images: { orderBy: { position: "asc" } },
        inventory: {
          include: { movements: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
      },
      orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
      take: 1000,
    });

    const allRows = variants.map((variant) => this.toRow(variant));
    const rows = status === "ALL" ? allRows : allRows.filter((row) => row.status === status);
    const summary = allRows.reduce(
      (total, row) => {
        total.onHand += row.onHand;
        total.reserved += row.reserved;
        total.available += row.available;
        if (row.status === "LOW") total.lowStock += 1;
        if (row.status === "OUT") total.outOfStock += 1;
        return total;
      },
      { onHand: 0, reserved: 0, available: 0, lowStock: 0, outOfStock: 0, variants: allRows.length },
    );

    return { summary, rows };
  }

  async history(variantId: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { variantId },
      select: {
        variant: { select: { sku: true, product: { select: { name: true } } } },
        movements: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!inventory) throw new NotFoundException("Inventory variant not found");
    return {
      productName: inventory.variant.product.name,
      sku: inventory.variant.sku,
      movements: inventory.movements,
    };
  }

  async adjust(variantId: string, input: AdjustInventoryInput, actor?: string) {
    this.validateAdjustment(input);

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{
        id: string;
        onHand: number;
        reserved: number;
        safetyStock: number;
        reorderLevel: number;
      }>>`
        SELECT "id", "onHand", "reserved", "safetyStock", "reorderLevel"
        FROM "Inventory"
        WHERE "variantId" = ${variantId}
        FOR UPDATE
      `;
      const current = locked[0];
      if (!current) throw new NotFoundException("Inventory variant not found");

      const delta = input.operation === "SET"
        ? input.quantity - current.onHand
        : input.operation === "REMOVE"
          ? -input.quantity
          : input.quantity;
      const nextOnHand = current.onHand + delta;
      if (nextOnHand < 0) throw new BadRequestException("Stock cannot be below zero");
      if (nextOnHand < current.reserved) {
        throw new BadRequestException("Stock cannot be reduced below the quantity reserved by active orders");
      }

      await tx.inventory.update({
        where: { id: current.id },
        data: {
          onHand: nextOnHand,
          ...(input.safetyStock !== undefined ? { safetyStock: input.safetyStock } : {}),
          ...(input.reorderLevel !== undefined ? { reorderLevel: input.reorderLevel } : {}),
          movements: {
            create: {
              type: input.reason,
              delta,
              onHandBefore: current.onHand,
              onHandAfter: nextOnHand,
              reason: this.reasonLabel(input.reason),
              note: input.note?.trim() || null,
              reference: input.reference?.trim() || null,
              actor: actor?.trim() || "HIDI Admin",
            },
          },
        },
      });

      const variant = await tx.productVariant.findUnique({
        where: { id: variantId },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              images: { orderBy: { position: "asc" }, take: 1 },
            },
          },
          images: { orderBy: { position: "asc" } },
          inventory: { include: { movements: { orderBy: { createdAt: "desc" }, take: 1 } } },
        },
      });
      if (!variant) throw new NotFoundException("Inventory variant not found");
      return this.toRow(variant);
    });
  }

  async listReceipts() {
    return this.prisma.stockReceipt.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            variant: {
              select: {
                sku: true,
                size: true,
                color: true,
                product: { select: { name: true } },
              },
            },
          },
        },
      },
    });
  }

  async createReceipt(input: StockReceiptInput, actor?: string) {
    const receipt = this.validateReceipt(input);
    const created = await this.prisma.stockReceipt.create({
      data: {
        receiptNumber: this.receiptNumber(),
        supplierName: receipt.supplierName,
        invoiceNumber: receipt.invoiceNumber,
        purchaseOrderNumber: receipt.purchaseOrderNumber,
        receivedAt: receipt.receivedAt,
        note: receipt.note,
        createdBy: actor?.trim() || "HIDI Admin",
        totalAccepted: receipt.lines.reduce((sum, line) => sum + line.acceptedQuantity, 0),
        totalRejected: receipt.lines.reduce((sum, line) => sum + line.rejectedQuantity, 0),
        lines: { createMany: { data: receipt.lines } },
      },
    });

    if (input.action === "POST") return this.postReceipt(created.id, actor);
    return this.receipt(created.id);
  }

  async postReceipt(receiptId: string, actor?: string) {
    return this.prisma.$transaction(async (tx) => {
      const lockedReceipt = await tx.$queryRaw<Array<{ id: string; status: StockReceiptStatus }>>`
        SELECT "id", "status"
        FROM "StockReceipt"
        WHERE "id" = ${receiptId}
        FOR UPDATE
      `;
      if (!lockedReceipt[0]) throw new NotFoundException("Stock receipt not found");
      if (lockedReceipt[0].status === StockReceiptStatus.POSTED) return this.receipt(receiptId, tx);
      if (lockedReceipt[0].status !== StockReceiptStatus.DRAFT) {
        throw new BadRequestException("Only draft receipts can be posted");
      }

      const receipt = await tx.stockReceipt.findUnique({
        where: { id: receiptId },
        include: { lines: { orderBy: { variantId: "asc" } } },
      });
      if (!receipt) throw new NotFoundException("Stock receipt not found");
      if (!receipt.invoiceNumber && !receipt.purchaseOrderNumber) {
        throw new BadRequestException("Add an invoice number or purchase order before posting");
      }
      if (!receipt.lines.length) throw new BadRequestException("Add at least one SKU before posting");

      for (const line of receipt.lines) {
        const lockedInventory = await tx.$queryRaw<Array<{ id: string; onHand: number; reserved: number }>>`
          SELECT "id", "onHand", "reserved"
          FROM "Inventory"
          WHERE "variantId" = ${line.variantId}
          FOR UPDATE
        `;
        const inventory = lockedInventory[0];
        if (!inventory) throw new BadRequestException(`Inventory is missing for variant ${line.variantId}`);
        if (line.acceptedQuantity === 0) continue;

        await tx.inventory.update({
          where: { id: inventory.id },
          data: {
            onHand: { increment: line.acceptedQuantity },
            movements: {
              create: {
                type: InventoryMovementType.RECEIPT,
                delta: line.acceptedQuantity,
                onHandBefore: inventory.onHand,
                onHandAfter: inventory.onHand + line.acceptedQuantity,
                reason: "Manufacturer stock received",
                reference: receipt.receiptNumber,
                note: [
                  receipt.supplierName,
                  receipt.invoiceNumber ? `Invoice ${receipt.invoiceNumber}` : null,
                  receipt.purchaseOrderNumber ? `PO ${receipt.purchaseOrderNumber}` : null,
                  line.rejectedQuantity ? `${line.rejectedQuantity} rejected` : null,
                ].filter(Boolean).join(" · "),
                actor: actor?.trim() || receipt.createdBy || "HIDI Admin",
              },
            },
          },
        });
      }

      await tx.stockReceipt.update({
        where: { id: receiptId },
        data: { status: StockReceiptStatus.POSTED, postedAt: new Date() },
      });
      return this.receipt(receiptId, tx);
    }, { timeout: 20_000 });
  }

  async createVariantImageUploadTicket(variantId: string, input: VariantImageUploadTicketInput) {
    const mimeType = input.mimeType?.trim().toLowerCase() ?? "";
    const sizeBytes = Number(input.sizeBytes);
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

    if (!allowed.has(mimeType)) throw new BadRequestException("Use a JPEG, PNG, WebP or AVIF image");
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 8 * 1024 * 1024) {
      throw new BadRequestException("Image must be smaller than 8 MB");
    }

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true },
    });
    if (!variant) throw new NotFoundException("Product variant not found");

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.adminMediaUploadTicket.deleteMany({
        where: { expiresAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
      });
      await tx.adminMediaUploadTicket.create({
        data: {
          tokenHash,
          variantId,
          mimeType,
          maxBytes: sizeBytes,
          expiresAt,
        },
      });
    });

    return { token, expiresAt };
  }

  async addVariantImage(variantId: string, input: VariantImageInput) {
    const url = input.url?.trim() ?? "";
    if (!this.validImageUrl(url)) throw new BadRequestException("Enter a valid HTTPS or local image URL");

    const source = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, productId: true, product: { select: { name: true } }, color: true, size: true },
    });
    if (!source) throw new NotFoundException("Product variant not found");

    const targets = input.applyToColor
      ? await this.prisma.productVariant.findMany({
          where: { productId: source.productId, color: source.color },
          select: { id: true, size: true },
          orderBy: { size: "asc" },
        })
      : [{ id: source.id, size: source.size }];

    await this.prisma.$transaction(async (tx) => {
      for (const target of targets) {
        const count = await tx.productVariantImage.count({ where: { variantId: target.id } });
        await tx.productVariantImage.upsert({
          where: { variantId_url: { variantId: target.id, url } },
          create: {
            variantId: target.id,
            url,
            storagePath: input.storagePath?.trim() || null,
            alt: input.alt?.trim() || `${source.product.name} · ${source.color} · ${target.size}`,
            position: count,
          },
          update: {
            storagePath: input.storagePath?.trim() || null,
            alt: input.alt?.trim() || `${source.product.name} · ${source.color} · ${target.size}`,
          },
        });
      }
    });

    return this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, sku: true, images: { orderBy: { position: "asc" } } },
    });
  }

  private toRow(variant: {
    id: string;
    sku: string;
    size: string;
    color: string;
    active: boolean;
    product: {
      id: string;
      name: string;
      slug: string;
      status: string;
      images: Array<{ url: string }>;
    };
    images: Array<{ id: string; url: string; alt: string; position: number }>;
    inventory: null | {
      onHand: number;
      reserved: number;
      safetyStock: number;
      reorderLevel: number;
      updatedAt: Date;
      movements: Array<{ createdAt: Date }>;
    };
  }) {
    if (!variant.inventory) throw new Error("Inventory relation is required");
    const physicalAvailable = Math.max(0, variant.inventory.onHand - variant.inventory.reserved);
    const available = Math.max(0, physicalAvailable - variant.inventory.safetyStock);
    const status: Exclude<InventoryStatus, "ALL"> = available <= 0
      ? "OUT"
      : physicalAvailable <= variant.inventory.reorderLevel
        ? "LOW"
        : "HEALTHY";

    return {
      variantId: variant.id,
      productId: variant.product.id,
      productName: variant.product.name,
      productSlug: variant.product.slug,
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      active: variant.active && variant.product.status === "ACTIVE",
      onHand: variant.inventory.onHand,
      reserved: variant.inventory.reserved,
      safetyStock: variant.inventory.safetyStock,
      reorderLevel: variant.inventory.reorderLevel,
      available,
      status,
      updatedAt: variant.inventory.updatedAt,
      lastMovementAt: variant.inventory.movements[0]?.createdAt ?? null,
      imageUrl: variant.images[0]?.url ?? variant.product.images[0]?.url ?? null,
      photoCount: variant.images.length,
    };
  }

  private async receipt(receiptId: string, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const receipt = await client.stockReceipt.findUnique({
      where: { id: receiptId },
      include: {
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            variant: {
              select: {
                sku: true,
                size: true,
                color: true,
                product: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!receipt) throw new NotFoundException("Stock receipt not found");
    return receipt;
  }

  private validateReceipt(input: StockReceiptInput) {
    const supplierName = input.supplierName?.trim() ?? "";
    if (!supplierName) throw new BadRequestException("Supplier name is required");
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new BadRequestException("Add at least one SKU to the receipt");
    }
    if (input.lines.length > 500) throw new BadRequestException("A receipt can contain at most 500 SKUs");

    const receivedAt = new Date(input.receivedAt ?? "");
    if (Number.isNaN(receivedAt.getTime())) throw new BadRequestException("Enter a valid received date");
    const seen = new Set<string>();
    const lines = input.lines.map((line) => {
      const variantId = line.variantId?.trim() ?? "";
      if (!variantId) throw new BadRequestException("Every receipt line needs a product variant");
      if (seen.has(variantId)) throw new BadRequestException("The same SKU cannot appear twice in one receipt");
      seen.add(variantId);

      const acceptedQuantity = line.acceptedQuantity ?? 0;
      const rejectedQuantity = line.rejectedQuantity ?? 0;
      const unitCostPaise = line.unitCostPaise ?? null;
      for (const [label, value] of [["Accepted quantity", acceptedQuantity], ["Rejected quantity", rejectedQuantity]] as const) {
        if (!Number.isInteger(value) || value < 0) throw new BadRequestException(`${label} must be a whole number of zero or more`);
      }
      if (acceptedQuantity === 0 && rejectedQuantity === 0) {
        throw new BadRequestException("Every receipt line needs an accepted or rejected quantity");
      }
      if (unitCostPaise !== null && (!Number.isInteger(unitCostPaise) || unitCostPaise < 0)) {
        throw new BadRequestException("Unit cost must be zero or more");
      }
      return { variantId, acceptedQuantity, rejectedQuantity, unitCostPaise };
    });

    const invoiceNumber = input.invoiceNumber?.trim() || null;
    const purchaseOrderNumber = input.purchaseOrderNumber?.trim() || null;
    if (input.action === "POST" && !invoiceNumber && !purchaseOrderNumber) {
      throw new BadRequestException("Add an invoice number or purchase order before posting");
    }

    return {
      supplierName,
      invoiceNumber,
      purchaseOrderNumber,
      receivedAt,
      note: input.note?.trim() || null,
      lines,
    };
  }

  private receiptNumber() {
    const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return `HIDI-GRN-${day}-${randomUUID().slice(0, 6).toUpperCase()}`;
  }

  private validImageUrl(value: string) {
    if (value.startsWith("/")) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:");
    } catch {
      return false;
    }
  }

  private normaliseStatus(value?: string): InventoryStatus {
    const status = value?.toUpperCase() ?? "ALL";
    return status === "HEALTHY" || status === "LOW" || status === "OUT" ? status : "ALL";
  }

  private validateAdjustment(input: AdjustInventoryInput) {
    if (!input || !["RECEIVE", "REMOVE", "SET"].includes(input.operation)) {
      throw new BadRequestException("Choose Receive, Remove or Set stock");
    }
    if (!Number.isInteger(input.quantity) || input.quantity < 0) {
      throw new BadRequestException("Quantity must be a whole number of zero or more");
    }
    if (input.operation !== "SET" && input.quantity === 0) {
      throw new BadRequestException("Quantity must be greater than zero");
    }
    if (!Object.values(InventoryMovementType).includes(input.reason)) {
      throw new BadRequestException("Choose a valid stock reason");
    }
    for (const [label, value] of [["Safety stock", input.safetyStock], ["Reorder level", input.reorderLevel]] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        throw new BadRequestException(`${label} must be a whole number of zero or more`);
      }
    }
  }

  private reasonLabel(reason: InventoryMovementType) {
    return ({
      RECEIPT: "Stock received",
      CORRECTION: "Manual correction",
      DAMAGE: "Damaged stock",
      RETURN_RESTOCK: "Customer return restocked",
      OTHER: "Other adjustment",
    } satisfies Record<InventoryMovementType, string>)[reason];
  }
}
