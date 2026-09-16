import { Module } from "@nestjs/common";
import { DelhiveryModule } from "../delhivery/delhivery.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";

@Module({
  imports: [DelhiveryModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
