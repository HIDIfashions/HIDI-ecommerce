import { Module } from "@nestjs/common";
import { RazorpayModule } from "../razorpay/razorpay.module.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";

@Module({
  imports: [RazorpayModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
