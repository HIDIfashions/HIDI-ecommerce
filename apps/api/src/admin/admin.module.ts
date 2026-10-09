import { Module } from '@nestjs/common';
import { AdminProductsModule } from './products/admin-products.module.js';
import { DelhiveryModule } from '../delhivery/delhivery.module.js';
import { AdminController } from './admin.controller.js';
import { AdminDashboardController } from './admin-dashboard.controller.js';
import { AdminInventoryService } from './admin-inventory.service.js';
import { AdminService } from './admin.service.js';
import { PackingScannerService } from './packing-scanner.service.js';
import { ReviewFollowUpService } from './review-followup.service.js';
import { AdminReturnsService } from './admin-returns.service.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { RazorpayModule } from '../razorpay/razorpay.module.js';
import { AdminSecurityModule } from './admin-security.module.js';
@Module({
  imports: [AdminSecurityModule, AdminProductsModule, DelhiveryModule, WalletModule, RazorpayModule],
  controllers: [AdminController, AdminDashboardController],
  providers: [AdminService, PackingScannerService, AdminInventoryService, ReviewFollowUpService, AdminReturnsService],
})
export class AdminModule {}
