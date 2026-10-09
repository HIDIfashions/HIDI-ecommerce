import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CartsService } from "./carts.service.js";

@Controller("carts")
export class CartsController {
  constructor(private readonly carts: CartsService) {}

  @Get(":sessionId")
  get(@Param("sessionId") sessionId: string) {
    return this.carts.get(sessionId);
  }

  @Post(":sessionId/items")
  add(
    @Param("sessionId") sessionId: string,
    @Body() body: { variantId?: string; quantity?: number },
  ) {
    return this.carts.addItem(sessionId, body.variantId ?? "", body.quantity ?? 1);
  }

  @Patch(":sessionId/items/:itemId")
  update(
    @Param("sessionId") sessionId: string,
    @Param("itemId") itemId: string,
    @Body() body: { quantity?: number; variantId?: string },
  ) {
    if (body.variantId !== undefined) return this.carts.changeSize(sessionId, itemId, body.variantId, body.quantity);
    return this.carts.updateItem(sessionId, itemId, body.quantity ?? 1);
  }

  @Delete(":sessionId/items/:itemId")
  remove(@Param("sessionId") sessionId: string, @Param("itemId") itemId: string) {
    return this.carts.removeItem(sessionId, itemId);
  }
}
