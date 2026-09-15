import { Module } from "@nestjs/common";
import { RazorpayModule } from "../razorpay/razorpay.module.js";
import { CheckoutController } from "./checkout.controller.js";
import { CheckoutService } from "./checkout.service.js";
import { ReservationJanitorService } from "./reservation-janitor.service.js";

@Module({
  imports: [RazorpayModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, ReservationJanitorService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
