import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { appendOrderAudit } from "../audit/order-audit.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AdminActor } from "./admin-auth.js";

function packingBarcode(variantId: string) {
  const token = variantId.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase().padStart(12, "0");
  return `H${token}`;
}

function normalizeScan(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

@Injectable()
export class PackingScannerService {
  constructor(private readonly prisma: PrismaService) {}

  async plan(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        customerPhone: true,
        totalPaise: true,
        items: {
          select: {
            id: true,
            variantId: true,
            sku: true,
            productName: true,
            size: true,
            color: true,
            quantity: true,
            product: {
              select: {
                images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
              },
            },
          },
          orderBy: { id: "asc" },
        },
      },
    });

    if (!order) throw new NotFoundException("Order not found");

    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt,
        customerPhone: order.customerPhone,
        totalPaise: order.totalPaise,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        items: order.items.map((item) => ({
          id: item.id,
          barcode: packingBarcode(item.variantId),
          sku: item.sku,
          productName: item.productName,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
          image: item.product.images[0]?.url ?? null,
        })),
      },
    };
  }

  async complete(orderNumber: string, scannedBarcodes: unknown, actor: AdminActor) {
    if (!Array.isArray(scannedBarcodes)) throw new BadRequestException("Scanned barcodes are required");
    if (scannedBarcodes.length === 0 || scannedBarcodes.length > 250) {
      throw new BadRequestException("Scan between 1 and 250 pieces for one order");
    }

    const scans = scannedBarcodes.map(normalizeScan);
    if (scans.some((value) => !/^H[A-Z0-9]{12}$/.test(value))) {
      throw new BadRequestException("One or more scanned barcodes are invalid");
    }

    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        status: true,
        items: {
          select: {
            variantId: true,
            sku: true,
            productName: true,
            size: true,
            color: true,
            quantity: true,
          },
          orderBy: { id: "asc" },
        },
      },
    });

    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "CONFIRMED") {
      if (order.status === "PACKED") {
        return { packed: true, alreadyPacked: true, orderNumber, status: "PACKED" };
      }
      throw new BadRequestException(`Only CONFIRMED orders can be packed by scanner. Current status: ${order.status}`);
    }

    const expected = new Map<string, {
      quantity: number;
      sku: string;
      productName: string;
      size: string;
      color: string;
    }>();

    for (const item of order.items) {
      const barcode = packingBarcode(item.variantId);
      const current = expected.get(barcode);
      expected.set(barcode, {
        quantity: (current?.quantity ?? 0) + item.quantity,
        sku: item.sku,
        productName: item.productName,
        size: item.size,
        color: item.color,
      });
    }

    const actual = new Map<string, number>();
    for (const barcode of scans) actual.set(barcode, (actual.get(barcode) ?? 0) + 1);

    const unknown = [...actual.keys()].filter((barcode) => !expected.has(barcode));
    if (unknown.length) {
      throw new BadRequestException(`Wrong item scanned: ${unknown.slice(0, 3).join(", ")}`);
    }

    const mismatch = [...expected.entries()].flatMap(([barcode, item]) => {
      const scanned = actual.get(barcode) ?? 0;
      return scanned === item.quantity ? [] : [{
        barcode,
        sku: item.sku,
        productName: item.productName,
        size: item.size,
        color: item.color,
        required: item.quantity,
        scanned,
      }];
    });

    const requiredPieces = order.items.reduce((sum, item) => sum + item.quantity, 0);
    if (mismatch.length || scans.length !== requiredPieces) {
      throw new BadRequestException({
        message: "Packing is incomplete or has incorrect quantities",
        mismatch,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({
        where: { id: order.id, status: "CONFIRMED" as any },
        data: { status: "PACKED" as any },
      });

      if (changed.count !== 1) {
        throw new BadRequestException("Order status changed while packing. Reload the order before retrying.");
      }

      await appendOrderAudit(tx, {
        orderId: order.id,
        eventType: "ORDER_PACKED",
        actorType: "ADMIN",
        actorId: actor.id,
        entityType: "ORDER",
        entityId: order.id,
        fromStatus: "CONFIRMED",
        toStatus: "PACKED",
        eventKey: `order:${order.id}:status:PACKED`,
        source: "PACKING_SCANNER",
        metadata: {
          adminName: actor.displayName,
          adminRole: actor.role,
          scannedPieces: scans.length,
          uniqueBarcodes: actual.size,
          barcodes: [...actual.entries()].map(([barcode, quantity]) => ({ barcode, quantity })),
        },
      });

      return {
        packed: true,
        alreadyPacked: false,
        orderNumber,
        status: "PACKED",
        scannedPieces: scans.length,
      };
    });
  }
}
