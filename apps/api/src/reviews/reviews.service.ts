import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async invitation(token: string) {
    const followUp = await this.prisma.reviewFollowUp.findUnique({
      where: { reviewToken: token },
      include: {
        order: {
          include: {
            items: {
              include: {
                product: {
                  select: {
                    slug: true,
                    images: {
                      orderBy: { position: "asc" },
                      take: 1,
                    },
                  },
                },
                review: true,
              },
              orderBy: { id: "asc" },
            },
          },
        },
      },
    });

    if (!followUp || followUp.channel !== "EMAIL") {
      throw new NotFoundException("Review invitation not found");
    }
    if (followUp.order.status !== "DELIVERED") {
      throw new BadRequestException("This order is not eligible for review yet");
    }

    const address = (followUp.order.shippingAddress ?? {}) as Record<string, unknown>;
    const reviewerName = [address.firstName, address.lastName]
      .filter((value) => typeof value === "string" && value.trim())
      .join(" ")
      .trim();

    return {
      orderNumber: followUp.order.orderNumber,
      reviewerName: reviewerName || "HIDI Customer",
      completedAt: followUp.completedAt,
      items: followUp.order.items.map((item) => ({
        orderItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        productSlug: item.product.slug,
        imageUrl: item.product.images[0]?.url ?? null,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        reviewed: Boolean(item.review),
        review: item.review
          ? {
              rating: item.review.rating,
              title: item.review.title,
              body: item.review.body,
              createdAt: item.review.createdAt,
            }
          : null,
      })),
    };
  }

  async submit(
    token: string,
    input: {
      orderItemId?: string;
      rating?: number;
      title?: string;
      body?: string;
      reviewerName?: string;
    },
  ) {
    const followUp = await this.prisma.reviewFollowUp.findUnique({
      where: { reviewToken: token },
      include: {
        order: {
          include: {
            items: {
              include: {
                review: true,
              },
            },
          },
        },
      },
    });

    if (!followUp || followUp.channel !== "EMAIL") {
      throw new NotFoundException("Review invitation not found");
    }
    if (followUp.order.status !== "DELIVERED") {
      throw new BadRequestException("This order is not eligible for review yet");
    }

    const orderItemId = String(input.orderItemId ?? "").trim();
    const item = followUp.order.items.find((candidate) => candidate.id === orderItemId);
    if (!item) throw new BadRequestException("This product is not part of the reviewed order");
    if (item.review) throw new BadRequestException("This product has already been reviewed");

    const rating = Number(input.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException("Rating must be between 1 and 5");
    }

    const body = String(input.body ?? "").trim();
    if (body.length < 10 || body.length > 2000) {
      throw new BadRequestException("Review must be between 10 and 2000 characters");
    }

    const title = String(input.title ?? "").trim().slice(0, 120) || null;
    const reviewerName = String(input.reviewerName ?? "").trim().slice(0, 80) || "HIDI Customer";

    const review = await this.prisma.productReview.create({
      data: {
        productId: item.productId,
        orderId: followUp.order.id,
        orderItemId: item.id,
        rating,
        title,
        body,
        reviewerName,
        verifiedPurchase: true,
        published: true,
      },
    });

    const reviewedCount = await this.prisma.productReview.count({
      where: { orderId: followUp.order.id },
    });

    if (reviewedCount >= followUp.order.items.length) {
      await this.prisma.reviewFollowUp.update({
        where: { id: followUp.id },
        data: { completedAt: new Date() },
      });
    }

    return {
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      reviewerName: review.reviewerName,
      verifiedPurchase: review.verifiedPurchase,
      createdAt: review.createdAt,
    };
  }

  async productReviews(productId: string) {
    const [reviews, aggregate] = await Promise.all([
      this.prisma.productReview.findMany({
        where: { productId, published: true },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          reviewerName: true,
          verifiedPurchase: true,
          createdAt: true,
        },
      }),
      this.prisma.productReview.aggregate({
        where: { productId, published: true },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    return {
      averageRating: aggregate._avg.rating ?? 0,
      reviewCount: aggregate._count.rating,
      reviews,
    };
  }
}
