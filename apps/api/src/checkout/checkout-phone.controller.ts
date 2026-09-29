import { Body, Controller, Get, Header, Headers, Post } from "@nestjs/common";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { CheckoutPhoneService } from "./checkout-phone.service.js";

@Controller("checkout/phone")
export class CheckoutPhoneController {
  constructor(private readonly phone: CheckoutPhoneService, private readonly auth: SupabaseAuthService) {}

  @Get("policy")
  @Header("Cache-Control", "private, no-store")
  policy() { return this.phone.policy(); }

  @Post("send")
  @Header("Cache-Control", "private, no-store")
  async send(@Body() body: any, @Headers("authorization") authorization?: string) {
    const auth = authorization === undefined ? null : await this.auth.requireUser(authorization);
    return this.phone.send(body, auth);
  }

  @Post("verify")
  @Header("Cache-Control", "private, no-store")
  async verify(@Body() body: any, @Headers("authorization") authorization?: string) {
    const auth = authorization === undefined ? null : await this.auth.requireUser(authorization);
    return this.phone.verify(body, auth);
  }
}
