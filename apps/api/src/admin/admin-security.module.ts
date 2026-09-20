import { Global, Module } from "@nestjs/common";
import { AdminAuthService, AdminGuard } from "./admin-auth.js";

@Global()
@Module({
  providers: [AdminAuthService, AdminGuard],
  exports: [AdminAuthService, AdminGuard],
})
export class AdminSecurityModule {}
