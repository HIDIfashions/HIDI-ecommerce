import { Module } from "@nestjs/common";
import { AccountController } from "./account.controller.js";
import { AccountService } from "./account.service.js";
import { WalletModule } from "../wallet/wallet.module.js";
import { ReviewsModule } from "../reviews/reviews.module.js";

@Module({
  imports: [WalletModule, ReviewsModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
