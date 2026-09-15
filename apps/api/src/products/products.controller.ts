import { Controller, Get, Param, Query } from "@nestjs/common";
import { ProductsService } from "./products.service.js";

@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query("category") category?: string) {
    return this.products.listPublished(category);
  }

  @Get(":slug")
  bySlug(@Param("slug") slug: string) {
    return this.products.bySlug(slug);
  }
}
