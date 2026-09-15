import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CheckoutService } from "./checkout.service.js";

@Controller("checkout")
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post("prepare")
  prepare(@Body() body: any) {
    return this.checkout.prepare(body);
  }

  @Get("confirmation/:orderNumber")
  confirmation(
    @Param("orderNumber") orderNumber: string,
    @Query("sessionId") sessionId: string,
  ) {
    return this.checkout.confirmation(orderNumber, sessionId);
  }
}
