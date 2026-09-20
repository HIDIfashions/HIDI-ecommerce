import { Module } from "@nestjs/common";
import { AccountController } from "./account.controller.js";
import { AccountService } from "./account.service.js";
import { WalletModule } from "../wallet/wallet.module.js";

@Module({
  imports: [WalletModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
