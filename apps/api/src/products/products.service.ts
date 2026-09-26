import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

const CARD_MEDIA_LIMIT = 3;
const cardInclude = {
  category: true,
  collections: { include: { collection: true }, orderBy: { position: "asc" as const } },
  images: { orderBy: { position: "asc" as const }, take: CARD_MEDIA_LIMIT },
  variants: {
    where: { active: true },
    include: {
      inventory: true,
      images: { orderBy: { position: "asc" as const }, take: CARD_MEDIA_LIMIT },
    },
    orderBy: [{ color: "asc" as const }, { size: "asc" as const }],
  },
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(category?: string, limit?: number) {
    const safeLimit = limit === undefined
      ? undefined
      : Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 24) : undefined;

    const products = await this.prisma.product.findMany({
      where: {
        status: "ACTIVE",
        ...(category ? { collections: { some: { collection: { slug: category, active: true } } } } : {}),
      },
      orderBy: [{ featuredRank: "asc" }, { createdAt: "desc" }],
      ...(safeLimit ? { take: safeLimit } : {}),
      include: cardInclude,
    });
    return products.map((product) => this.toCardView(product));
  }

  async featured(limit = 4) {
    const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 8) : 4;
    const best = await this.bestSellers(safeLimit);
    if (best.length >= safeLimit) return best.slice(0, safeLimit);

    const excluded = best.map((product: any) => product.id);
    const fill = await this.prisma.product.findMany({
      where: {
        status: "ACTIVE",
        ...(excluded.length ? { id: { notIn: excluded } } : {}),
      },
      orderBy: [{ featuredRank: "asc" }, { createdAt: "desc" }],
      take: safeLimit - best.length,
      include: cardInclude,
    });

    return [...best, ...fill.map((product) => this.toCardView(product))];
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
      include: cardInclude,
    });

    const byId = new Map(products.map((product) => [product.id, product]));
    return ranked.flatMap((row) => {
      const product = byId.get(row.productId);
      if (!product) return [];
      return [{
        ...this.toCardView(product),
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
        variants: { where: { active: true }, include: { inventory: true, images: { orderBy: { position: "asc" } } } },
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
      include: cardInclude,
    });

    const sourceView = this.toView(source);
    const sourceCollections = new Set(sourceView.collections.map((item: any) => item.id));
    return candidates
      .map((product) => this.toCardView(product))
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
        variants: { where: { active: true }, include: { inventory: true, images: { orderBy: { position: "asc" } } } },
        category: true,
        collections: { include: { collection: true }, orderBy: { position: "asc" } },
      },
    });
    if (!product || product.status !== "ACTIVE") throw new NotFoundException("Product not found");
    return this.toView(product);
  }

  private toCardView(product: any) {
    const mediaColourSeen = new Set<string>();
    const variants = product.variants.map((variant: any) => {
      const colourKey = String(variant.color ?? "").trim().toLowerCase();
      const sourceImages = (variant.images ?? []).map((image: any) => ({
        id: image.id,
        url: image.url,
        alt: image.alt,
        position: image.position,
      }));
      const images = sourceImages.length && !mediaColourSeen.has(colourKey)
        ? sourceImages
        : [];
      if (images.length) mediaColourSeen.add(colourKey);

      return {
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
        images,
      };
    });
    const prices = variants.map((variant: any) => variant.pricePaise);

    const imageSource = [
      ...variants.flatMap((variant: any) => variant.images ?? []),
      ...(product.images ?? []),
    ];
    const seenUrls = new Set<string>();
    const images = imageSource
      .filter((image: any) => {
        const url = typeof image?.url === "string" ? image.url : "";
        if (!url || seenUrls.has(url)) return false;
        seenUrls.add(url);
        return true;
      })
      .slice(0, CARD_MEDIA_LIMIT)
      .map((image: any, position: number) => ({
        id: image.id,
        url: image.url,
        alt: image.alt,
        position,
      }));

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      fabric: product.fabric,
      category: product.category,
      collections: product.collections?.map((item: any) => item.collection) ?? [],
      images,
      variants,
      minPricePaise: prices.length ? Math.min(...prices) : 0,
      maxPricePaise: prices.length ? Math.max(...prices) : 0,
      inStock: variants.some((variant: any) => variant.available > 0),
    };
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
      bustMm: variant.bustMm,
      waistMm: variant.waistMm,
      hipMm: variant.hipMm,
      shoulderMm: variant.shoulderMm,
      sleeveLengthMm: variant.sleeveLengthMm,
      garmentLengthMm: variant.garmentLengthMm,
      available: variant.inventory
        ? Math.max(0, variant.inventory.onHand - variant.inventory.reserved - variant.inventory.safetyStock)
        : 0,
      images: (variant.images ?? []).map((image: any) => ({
        id: image.id,
        url: image.url,
        alt: image.alt,
        position: image.position,
      })),
    }));
    const prices = variants.map((v: any) => v.pricePaise);

    // Product-level images are optional in Admin. When photography was added to
    // SKU/colour variants, expose a de-duplicated gallery publicly instead of
    // returning an empty product.images array and forcing the storefront fallback.
    // SKU/colour photography uploaded from Admin is the primary storefront
    // media source. Product-level photography remains a fallback for legacy data.
    // Merge both so wishlist/cards never lose newly uploaded variant photos.
    const imageSource = [
      ...product.variants.flatMap((variant: any) => variant.images ?? []),
      ...(product.images ?? []),
    ];
    const seenUrls = new Set<string>();
    const images = imageSource
      .filter((image: any) => {
        const url = typeof image?.url === "string" ? image.url : "";
        if (!url || seenUrls.has(url)) return false;
        seenUrls.add(url);
        return true;
      })
      .map((image: any, position: number) => ({
        id: image.id,
        url: image.url,
        alt: image.alt,
        position,
      }));

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
      images,
      variants,
      minPricePaise: prices.length ? Math.min(...prices) : 0,
      maxPricePaise: prices.length ? Math.max(...prices) : 0,
      inStock: variants.some((v: any) => v.available > 0),
    };
  }
}
