import { Module } from "@nestjs/common";
import { RazorpayModule } from "../razorpay/razorpay.module.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
import { WalletModule } from "../wallet/wallet.module.js";

@Module({
  imports: [RazorpayModule, WalletModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
