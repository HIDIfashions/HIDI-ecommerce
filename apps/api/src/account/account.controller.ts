import { Controller, Get, Headers } from "@nestjs/common";
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
}
