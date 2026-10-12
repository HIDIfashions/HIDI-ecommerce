import { Global, Module } from "@nestjs/common";
import { AdminAuthService, AdminGuard } from "./admin-auth.js";
import { AdminEmailAuthController } from "./admin-email-auth.controller.js";

@Global()
@Module({
  controllers: [AdminEmailAuthController],
  providers: [AdminAuthService, AdminGuard],
  exports: [AdminAuthService, AdminGuard],
})
export class AdminSecurityModule {}
