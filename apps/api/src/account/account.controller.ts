import { Body, Controller, Get, Headers, Param, Patch, Post } from "@nestjs/common";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { AccountService } from "./account.service.js";

@Controller("account")
export class AccountController {
  constructor(
    private readonly auth: SupabaseAuthService,
    private readonly account: AccountService,
  ) {}

  @Get("orders")
  async orders(@Headers("authorization") authorization?: string) {
    const user = await this.auth.requireUser(authorization);
    return this.account.orders(user);
  }

  @Get("orders/:orderNumber")
  async order(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderNumber") orderNumber: string,
  ) {
    const user = await this.auth.requireUser(authorization);
    return this.account.order(user, orderNumber);
  }

  @Post("orders/:orderNumber/items/:orderItemId/review")
  async submitReview(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderNumber") orderNumber: string,
    @Param("orderItemId") orderItemId: string,
    @Body() body: { rating?: unknown; title?: unknown; body?: unknown },
  ) {
    const user = await this.auth.requireUser(authorization);
    return this.account.submitReview(user, orderNumber, orderItemId, body ?? {});
  }

  @Patch("orders/:orderNumber/returns/:requestId/cancel")
  async cancelReturnRequest(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderNumber") orderNumber: string,
    @Param("requestId") requestId: string,
  ) {
    const user = await this.auth.requireUser(authorization);
    return this.account.cancelReturnRequest(user, orderNumber, requestId);
  }

  @Post("orders/:orderNumber/returns")
  async createReturnRequest(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderNumber") orderNumber: string,
    @Body() body: {
      orderItemId?: unknown;
      type?: unknown;
      reason?: unknown;
      quantity?: unknown;
      refundDestination?: unknown;
      requestedSize?: unknown;
      detail?: unknown;
    },
  ) {
    const user = await this.auth.requireUser(authorization);
    return this.account.createReturnRequest(user, orderNumber, body);
  }
}
