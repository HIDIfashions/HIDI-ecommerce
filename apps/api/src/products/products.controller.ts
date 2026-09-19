import { Controller, Get, Param, Query } from "@nestjs/common";
import { ProductsService } from "./products.service.js";

@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query("category") category?: string) {
    return this.products.listPublished(category);
  }

  @Get("best-sellers")
  bestSellers(@Query("limit") rawLimit?: string) {
    const limit = rawLimit ? Number(rawLimit) : 8;
    return this.products.bestSellers(Number.isInteger(limit) ? limit : 8);
  }

  @Get(":slug")
  bySlug(@Param("slug") slug: string) {
    return this.products.bySlug(slug);
  }
}
