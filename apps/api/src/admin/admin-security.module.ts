import { Global, Module } from "@nestjs/common";
import { AdminAuthService, AdminGuard } from "./admin-auth.js";
import { AdminEmailAuthController } from "./admin-email-auth.controller.js";
import { AdminLoginController } from './admin-login.controller.js';

@Global()
@Module({
  controllers: [AdminEmailAuthController, AdminLoginController],
  providers: [AdminAuthService, AdminGuard],
  exports: [AdminAuthService, AdminGuard],
})
export class AdminSecurityModule {}
