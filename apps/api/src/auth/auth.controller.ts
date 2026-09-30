import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { SupabaseAuthService } from "./supabase-auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: SupabaseAuthService) {}

  @Get("config")
  config() {
    return this.auth.authConfig();
  }

  @Post("otp/request")
  @HttpCode(200)
  requestOtp(@Body() body: unknown) {
    return this.auth.requestPhoneOtp(body);
  }

  @Post("otp/verify")
  @HttpCode(200)
  verifyOtp(@Body() body: unknown) {
    return this.auth.verifyPhoneOtp(body);
  }

  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    return this.auth.refresh(body);
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Body() body: unknown) {
    return this.auth.logout(body);
  }
}
