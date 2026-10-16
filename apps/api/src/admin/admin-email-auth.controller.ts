import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { AdminAuthService } from "./admin-auth.js";

// Public sign-in entry only; eligibility is checked before any email is sent.
@Controller("auth/admin")
export class AdminEmailAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post("otp/request")
  @HttpCode(200)
  requestCode(@Body() body: unknown) {
    return this.auth.requestEmailCode(body);
  }
}
