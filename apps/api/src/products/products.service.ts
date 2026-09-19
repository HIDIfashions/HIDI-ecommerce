import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(category?: string) {
    const products = await this.prisma.product.findMany({
      where: {
        status: "ACTIVE",
        ...(category ? { collections: { some: { collection: { slug: category, active: true } } } } : {}),
      },
      orderBy: [{ featuredRank: "asc" }, { createdAt: "desc" }],
      include: {
        category: true,
        collections: { include: { collection: true }, orderBy: { position: "asc" } },
        // Return all photo metadata for the card gallery; browsers load image bytes on demand.
        images: { orderBy: { position: "asc" } },
        variants: {
          where: { active: true },
          include: { inventory: true },
          orderBy: [{ color: "asc" }, { size: "asc" }],
        },
      },
    });
    return products.map((p) => this.toView(p));
  }

  async bestSellers(limit = 8) {
    const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 12) : 8;
    const ranked = await this.prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        order: {
          status: { in: ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"] },
          payments: { some: { status: "CAPTURED" } },
        },
        product: { status: "ACTIVE" },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: safeLimit,
    });

    if (!ranked.length) return [];

    const productIds = ranked.map((row) => row.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, status: "ACTIVE" },
      include: {
        category: true,
        collections: { include: { collection: true }, orderBy: { position: "asc" } },
        images: { orderBy: { position: "asc" } },
        variants: {
          where: { active: true },
          include: { inventory: true },
          orderBy: [{ color: "asc" }, { size: "asc" }],
        },
      },
    });

    const byId = new Map(products.map((product) => [product.id, product]));
    return ranked.flatMap((row) => {
      const product = byId.get(row.productId);
      if (!product) return [];
      return [{
        ...this.toView(product),
        soldQuantity: row._sum.quantity ?? 0,
      }];
    });
  }

  async related(slug: string, limit = 4) {
    const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 8) : 4;
    const source = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        collections: { include: { collection: true } },
        images: { orderBy: { position: "asc" } },
        variants: { where: { active: true }, include: { inventory: true } },
      },
    });
    if (!source || source.status !== "ACTIVE") throw new NotFoundException("Product not found");

    const collectionIds = source.collections.map((item) => item.collectionId);
    const relationFilters: any[] = [];
    if (source.categoryId) relationFilters.push({ categoryId: source.categoryId });
    if (collectionIds.length) {
      relationFilters.push({ collections: { some: { collectionId: { in: collectionIds } } } });
    }

    const candidates = await this.prisma.product.findMany({
      where: {
        status: "ACTIVE",
        id: { not: source.id },
        ...(relationFilters.length ? { OR: relationFilters } : {}),
      },
      orderBy: [{ featuredRank: "asc" }, { createdAt: "desc" }],
      take: Math.max(safeLimit * 4, 12),
      include: {
        category: true,
        collections: { include: { collection: true }, orderBy: { position: "asc" } },
        images: { orderBy: { position: "asc" } },
        variants: {
          where: { active: true },
          include: { inventory: true },
          orderBy: [{ color: "asc" }, { size: "asc" }],
        },
      },
    });

    const sourceView = this.toView(source);
    const sourceCollections = new Set(sourceView.collections.map((item: any) => item.id));
    return candidates
      .map((product) => this.toView(product))
      .map((product) => {
        const sharedCollections = product.collections.filter((item: any) => sourceCollections.has(item.id)).length;
        const categoryMatch = sourceView.category?.id && product.category?.id === sourceView.category.id ? 1 : 0;
        const priceGap = Math.abs(product.minPricePaise - sourceView.minPricePaise);
        return {
          product,
          score: sharedCollections * 10 + categoryMatch * 5 - Math.min(priceGap / 100000, 4),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit)
      .map(({ product }) => product);
  }

  async bySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        images: { orderBy: { position: "asc" } },
        variants: { where: { active: true }, include: { inventory: true } },
        category: true,
        collections: { include: { collection: true }, orderBy: { position: "asc" } },
      },
    });
    if (!product || product.status !== "ACTIVE") throw new NotFoundException("Product not found");
    return this.toView(product);
  }

  private toView(product: any) {
    const variants = product.variants.map((variant: any) => ({
      id: variant.id,
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      colorHex: variant.colorHex,
      mrpPaise: variant.mrpPaise,
      pricePaise: variant.pricePaise,
      available: variant.inventory
        ? Math.max(0, variant.inventory.onHand - variant.inventory.reserved - variant.inventory.safetyStock)
        : 0,
    }));
    const prices = variants.map((v: any) => v.pricePaise);
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      shortDescription: product.shortDescription,
      description: product.description,
      fabric: product.fabric,
      care: product.care,
      category: product.category,
      collections: product.collections?.map((item: any) => item.collection) ?? [],
      images: product.images,
      variants,
      minPricePaise: prices.length ? Math.min(...prices) : 0,
      maxPricePaise: prices.length ? Math.max(...prices) : 0,
      inStock: variants.some((v: any) => v.available > 0),
    };
  }
}
