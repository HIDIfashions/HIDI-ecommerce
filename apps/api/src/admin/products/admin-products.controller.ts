import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AdminGuard, RequireAdminPermissions } from "../admin-auth.js";
import { AdminProductsService } from "./admin-products.service.js";

@Controller("admin/products")
@UseGuards(AdminGuard)
export class AdminProductsController {
  constructor(private readonly products: AdminProductsService) {}
  @Get() @RequireAdminPermissions("catalog:read") list(@Query("q") q?: string, @Query("status") status?: string, @Query("page") page?: string) { return this.products.list(q, status, page); }
  @Get("options") @RequireAdminPermissions("catalog:read") options() { return this.products.options(); }
  @Get("price-tags") @RequireAdminPermissions("catalog:read") priceTags(
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("stock") stock?: string,
    @Query("productId") productId?: string,
  ) { return this.products.priceTags(q, status, stock, productId); }
  @Post("categories") @RequireAdminPermissions("catalog:write") category(@Body() body: unknown) { return this.products.createCategory(body); }
  @Post() @RequireAdminPermissions("catalog:write") create(@Body() body: unknown) { return this.products.create(body); }
  @Get(":productId") @RequireAdminPermissions("catalog:read") detail(@Param("productId") id: string) { return this.products.get(id); }
  @Get(":productId/deletion") @RequireAdminPermissions("catalog:write") deletion(@Param("productId") id: string) { return this.products.getDeletion(id); }
  @Patch(":productId") @RequireAdminPermissions("catalog:write") edit(@Param("productId") id: string, @Body() body: unknown) { return this.products.edit(id, body); }
  @Delete(":productId") @RequireAdminPermissions("catalog:write") remove(@Param("productId") id: string, @Body() body: unknown) { return this.products.beginDeletion(id, body); }
  @Post(":productId/deletion/cleanup") @RequireAdminPermissions("catalog:write") cleanup(@Param("productId") id: string, @Body() body: unknown) { return this.products.finishDeletionCleanup(id, body); }
  @Post(":productId/variants") @RequireAdminPermissions("catalog:write") variants(@Param("productId") id: string, @Body() body: unknown) { return this.products.addVariants(id, body); }
  @Patch(":productId/variants/:variantId") @RequireAdminPermissions("catalog:write") variant(@Param("productId") id: string, @Param("variantId") variantId: string, @Body() body: unknown) { return this.products.editVariant(id, variantId, body); }
  @Post(":productId/status") @RequireAdminPermissions("catalog:write") status(@Param("productId") id: string, @Body() body: unknown) { return this.products.setStatus(id, body); }
}
