import { Controller, Get, Header, Headers } from "@nestjs/common";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { RewardsService } from "./rewards.service.js";

@Controller("rewards")
export class RewardsController {
  constructor(private readonly auth: SupabaseAuthService, private readonly rewards: RewardsService) {}

  @Get("summary")
  @Header("Cache-Control", "private, no-store")
  async summary(@Headers("authorization") authorization?: string) {
    const user = await this.auth.requireUser(authorization);
    return this.rewards.summary(user);
  }
}
