import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AdminProductsGuard } from "./admin-products.guard.js";
import { AdminProductsService } from "./admin-products.service.js";

@Controller("admin/products")
@UseGuards(AdminProductsGuard)
export class AdminProductsController {
  constructor(private readonly products: AdminProductsService) {}
  @Get() list(@Query("q") q?: string, @Query("status") status?: string, @Query("page") page?: string) { return this.products.list(q, status, page); }
  @Get("options") options() { return this.products.options(); }
  @Post("categories") category(@Body() body: unknown) { return this.products.createCategory(body); }
  @Post() create(@Body() body: unknown) { return this.products.create(body); }
  @Get(":productId") detail(@Param("productId") id: string) { return this.products.get(id); }
  @Patch(":productId") edit(@Param("productId") id: string, @Body() body: unknown) { return this.products.edit(id, body); }
  @Post(":productId/variants") variants(@Param("productId") id: string, @Body() body: unknown) { return this.products.addVariants(id, body); }
  @Patch(":productId/variants/:variantId") variant(@Param("productId") id: string, @Param("variantId") variantId: string, @Body() body: unknown) { return this.products.editVariant(id, variantId, body); }
  @Post(":productId/status") status(@Param("productId") id: string, @Body() body: unknown) { return this.products.setStatus(id, body); }
}
