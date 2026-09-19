import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
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
