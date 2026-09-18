import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { CheckoutService } from "./checkout.service.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";

@Controller("checkout")
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService, private readonly auth: SupabaseAuthService) {}

  @Post("prepare")
  async prepare(@Body() body: any, @Headers("authorization") authorization?: string) {
    // An invalid supplied token is never downgraded to anonymous checkout.
    const customer = authorization === undefined ? null : await this.auth.requireUser(authorization);
    return this.checkout.prepare(body, customer);
  }

  @Get("orders")
  orders(@Query("sessionId") sessionId: string) {
    return this.checkout.orders(sessionId);
  }

  @Get("confirmation/:orderNumber")
  confirmation(
    @Param("orderNumber") orderNumber: string,
    @Query("sessionId") sessionId: string,
  ) {
    return this.checkout.confirmation(orderNumber, sessionId);
  }
}
