import { BadRequestException, Body, Controller, Headers, Post, Req } from "@nestjs/common";
import { PaymentsService } from "./payments.service.js";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post("razorpay/verify")
  verify(@Body() body: any) {
    return this.payments.verifyCheckout(body);
  }

  @Post("razorpay/webhook")
  webhook(
    @Req() req: any,
    @Headers("x-razorpay-signature") signature?: string,
  ) {
    if (!req.rawBody || !signature) throw new BadRequestException("Invalid webhook request");
    return this.payments.handleWebhook(req.rawBody, signature, req.body);
  }
}
