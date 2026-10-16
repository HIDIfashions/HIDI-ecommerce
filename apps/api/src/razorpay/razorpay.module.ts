import { Module } from "@nestjs/common";
import { RazorpayService } from "./razorpay.service.js";

@Module({
  providers: [RazorpayService],
  exports: [RazorpayService],
})
export class RazorpayModule {}
