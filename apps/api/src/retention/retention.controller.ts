import { Body, Controller, Get, Header, Headers, Patch, Post, Query, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { RetentionService } from "./retention.service.js";

@Controller("retention")
export class RetentionController {
  constructor(private readonly retention: RetentionService, private readonly auth: SupabaseAuthService) {}

  @Get("preferences")
  @Header("Cache-Control", "private, no-store")
  async preferences(@Headers("authorization") authorization?: string) {
    return this.retention.preferences(await this.auth.requireUser(authorization));
  }

  @Patch("preferences")
  @Header("Cache-Control", "private, no-store")
  async savePreferences(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    return this.retention.savePreferences(await this.auth.requireUser(authorization), body);
  }

  @Post("events")
  async track(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    return this.retention.track(await this.auth.requireUser(authorization), body);
  }

  @Get("admin/preview")
  @Header("Cache-Control", "private, no-store")
  async preview(@Headers("x-admin-key") key: string | undefined, @Query("after") after?: string) {
    const expected = process.env.ADMIN_API_KEY;
    if (!expected || !key || Buffer.byteLength(key) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(key), Buffer.from(expected))) {
      throw new UnauthorizedException("Admin access required");
    }
    return this.retention.adminPreview(after);
  }
}
