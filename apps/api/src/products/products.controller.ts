import { Controller, Get, Param, Query } from "@nestjs/common";
import { ProductsService } from "./products.service.js";

@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query("category") category?: string, @Query("limit") rawLimit?: string) {
    const parsedLimit = rawLimit === undefined ? undefined : Number(rawLimit);
    const limit = parsedLimit !== undefined && Number.isInteger(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 24)
      : undefined;
    return this.products.listPublished(category, limit);
  }

  @Get("featured")
  featured(@Query("limit") rawLimit?: string) {
    const limit = rawLimit ? Number(rawLimit) : 4;
    return this.products.featured(Number.isInteger(limit) ? limit : 4);
  }

  @Get("best-sellers")
  bestSellers(@Query("limit") rawLimit?: string) {
    const limit = rawLimit ? Number(rawLimit) : 8;
    return this.products.bestSellers(Number.isInteger(limit) ? limit : 8);
  }

  @Get(":slug/related")
  related(@Param("slug") slug: string, @Query("limit") rawLimit?: string) {
    const limit = rawLimit ? Number(rawLimit) : 4;
    return this.products.related(slug, Number.isInteger(limit) ? limit : 4);
  }

  @Get(":slug")
  bySlug(@Param("slug") slug: string) {
    return this.products.bySlug(slug);
  }
}
