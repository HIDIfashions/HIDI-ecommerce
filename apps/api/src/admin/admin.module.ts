import { Module } from "@nestjs/common";
import { AdminProductsModule } from "./products/admin-products.module.js";
import { DelhiveryModule } from "../delhivery/delhivery.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminInventoryService } from "./admin-inventory.service.js";
import { AdminService } from "./admin.service.js";
import { ReviewFollowUpService } from "./review-followup.service.js";

@Module({
  imports: [AdminProductsModule, DelhiveryModule],
  controllers: [AdminController],
  providers: [AdminService, AdminInventoryService, ReviewFollowUpService],
})
export class AdminModule {}
