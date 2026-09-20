import { Module } from "@nestjs/common";
import { AdminProductsModule } from "./products/admin-products.module.js";
import { DelhiveryModule } from "../delhivery/delhivery.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminInventoryService } from "./admin-inventory.service.js";
import { AdminService } from "./admin.service.js";
import { ReviewFollowUpService } from "./review-followup.service.js";
import { AdminReturnsService } from "./admin-returns.service.js";
import { WalletModule } from "../wallet/wallet.module.js";
import { RazorpayModule } from "../razorpay/razorpay.module.js";
import { AdminAuthService, AdminGuard } from "./admin-auth.js";

@Module({
  imports: [AdminProductsModule, DelhiveryModule, WalletModule, RazorpayModule],
  controllers: [AdminController],
  providers: [AdminService, AdminInventoryService, ReviewFollowUpService, AdminReturnsService, AdminAuthService, AdminGuard],
  exports: [AdminAuthService, AdminGuard],
})
export class AdminModule {}
