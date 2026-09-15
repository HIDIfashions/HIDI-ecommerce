import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      product: { include: { images: { orderBy: { position: "asc" as const }, take: 1 } } },
      variant: { include: { inventory: true } },
    },
  },
};

@Injectable()
export class CartsService {
  constructor(private readonly prisma: PrismaService) {}

  private validateSession(sessionId: string) {
    if (!sessionId || sessionId.length < 8 || sessionId.length > 128) {
      throw new BadRequestException("Invalid cart session");
    }
  }

  async get(sessionId: string) {
    this.validateSession(sessionId);
    const cart = await this.prisma.cart.findUnique({
      where: { sessionId },
      include: cartInclude,
    });
    if (!cart) {
      return { id: null, sessionId, currency: "INR", items: [], itemCount: 0, subtotalPaise: 0 };
    }
    return this.toView(cart);
  }

  async addItem(sessionId: string, variantId: string, quantity: number) {
    this.validateSession(sessionId);
    if (!variantId) throw new BadRequestException("variantId is required");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new BadRequestException("Quantity must be between 1 and 10");
    }

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true, inventory: true },
    });
    if (!variant || !variant.active || variant.product.status !== "ACTIVE") {
      throw new NotFoundException("Product variant not found");
    }
    if (!variant.inventory) throw new BadRequestException("Inventory is unavailable");

    const available = Math.max(
      0,
      variant.inventory.onHand - variant.inventory.reserved - variant.inventory.safetyStock,
    );
    if (available < quantity) throw new BadRequestException("Selected size is currently unavailable");

    const cart = await this.prisma.cart.upsert({
      where: { sessionId },
      update: { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      create: { sessionId, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });

    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
    });
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    if (nextQuantity > 10 || nextQuantity > available) {
      throw new BadRequestException(`Only ${available} item(s) are currently available`);
    }

    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      update: { quantity: nextQuantity, unitPricePaise: variant.pricePaise },
      create: {
        cartId: cart.id,
        productId: variant.productId,
        variantId,
        quantity,
        unitPricePaise: variant.pricePaise,
      },
    });
    return this.get(sessionId);
  }

  async updateItem(sessionId: string, itemId: string, quantity: number) {
    this.validateSession(sessionId);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new BadRequestException("Quantity must be between 1 and 10");
    }

    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cart: { sessionId } },
      include: { variant: { include: { inventory: true } } },
    });
    if (!item) throw new NotFoundException("Cart item not found");
    if (!item.variant.inventory) throw new BadRequestException("Inventory is unavailable");

    const available = Math.max(
      0,
      item.variant.inventory.onHand - item.variant.inventory.reserved - item.variant.inventory.safetyStock,
    );
    if (quantity > available) throw new BadRequestException(`Only ${available} item(s) are available`);

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity, unitPricePaise: item.variant.pricePaise },
    });
    return this.get(sessionId);
  }

  async removeItem(sessionId: string, itemId: string) {
    this.validateSession(sessionId);
    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cart: { sessionId } } });
    if (!item) throw new NotFoundException("Cart item not found");
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    return this.get(sessionId);
  }

  private toView(cart: any) {
    const items = cart.items.map((item: any) => {
      const available = item.variant.inventory
        ? Math.max(0, item.variant.inventory.onHand - item.variant.inventory.reserved - item.variant.inventory.safetyStock)
        : 0;
      return {
        id: item.id,
        quantity: item.quantity,
        unitPricePaise: item.variant.pricePaise,
        lineTotalPaise: item.variant.pricePaise * item.quantity,
        product: {
          id: item.product.id,
          slug: item.product.slug,
          name: item.product.name,
          image: item.product.images[0]?.url ?? null,
        },
        variant: {
          id: item.variant.id,
          sku: item.variant.sku,
          size: item.variant.size,
          color: item.variant.color,
          available,
        },
      };
    });
    return {
      id: cart.id,
      sessionId: cart.sessionId,
      currency: cart.currency,
      items,
      itemCount: items.reduce((sum: number, item: any) => sum + item.quantity, 0),
      subtotalPaise: items.reduce((sum: number, item: any) => sum + item.lineTotalPaise, 0),
    };
  }
}
