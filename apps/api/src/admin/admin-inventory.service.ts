import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InventoryMovementType } from "../generated/prisma/client.js";
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
        product: { select: { id: true, name: true, slug: true, status: true } },
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
          product: { select: { id: true, name: true, slug: true, status: true } },
          inventory: { include: { movements: { orderBy: { createdAt: "desc" }, take: 1 } } },
        },
      });
      if (!variant) throw new NotFoundException("Inventory variant not found");
      return this.toRow(variant);
    });
  }

  private toRow(variant: {
    id: string;
    sku: string;
    size: string;
    color: string;
    active: boolean;
    product: { id: string; name: string; slug: string; status: string };
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
    };
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
