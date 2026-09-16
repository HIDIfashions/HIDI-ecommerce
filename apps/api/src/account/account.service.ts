import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { VerifiedAuthUser } from "../auth/supabase-auth.service.js";

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  private async customer(authUser: VerifiedAuthUser) {
    const firstName = typeof authUser.metadata.first_name === "string" ? authUser.metadata.first_name : null;
    const lastName = typeof authUser.metadata.last_name === "string" ? authUser.metadata.last_name : null;

    const user = await this.prisma.user.upsert({
      where: { email: authUser.email },
      create: {
        email: authUser.email,
        firstName,
        lastName,
      },
      update: {
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
      },
    });

    const unclaimed = await this.prisma.order.findMany({
      where: {
        userId: null,
        customerEmail: { equals: authUser.email, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (unclaimed.length) {
      await this.prisma.order.updateMany({
        where: { id: { in: unclaimed.map((order) => order.id) } },
        data: { userId: user.id },
      });
    }

    return user;
  }

  async orders(authUser: VerifiedAuthUser) {
    const user = await this.customer(authUser);
    const orders = await this.prisma.order.findMany({
      where: {
        userId: user.id,
        status: { not: "CANCELLED" },
      },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            product: {
              include: { images: { orderBy: { position: "asc" }, take: 1 } },
            },
          },
          orderBy: { id: "asc" },
        },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return {
      customer: {
        email: authUser.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      orders: orders.map((order) => ({
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt,
        totalPaise: order.totalPaise,
        paymentStatus: order.payments[0]?.status ?? null,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        items: order.items.map((item) => ({
          id: item.id,
          productName: item.productName,
          slug: item.product.slug,
          image: item.product.images[0]?.url ?? null,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
          totalPaise: item.totalPaise,
        })),
      })),
    };
  }

  async ownsOrder(authUser: VerifiedAuthUser, orderNumber: string) {
    const user = await this.customer(authUser);
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, userId: user.id },
      select: { id: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    return true;
  }
}
