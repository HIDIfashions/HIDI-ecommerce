import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { WalletService } from "./wallet.service.js";
import { WalletAdminService } from "./wallet-admin.service.js";
import { WalletController } from "./wallet.controller.js";
import { WalletWorkerService } from "./wallet-worker.service.js";

@Module({
  imports: [AuthModule],
  controllers: [WalletController],
  providers: [WalletService, WalletAdminService, WalletWorkerService],
  exports: [WalletService],
})
export class WalletModule {}
