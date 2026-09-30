import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { SupabaseAuthService } from "./supabase-auth.service.js";

@Global()
@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthService],
  exports: [SupabaseAuthService],
})
export class AuthModule {}
