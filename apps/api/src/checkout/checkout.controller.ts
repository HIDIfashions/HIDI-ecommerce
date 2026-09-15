import { Body, Controller, Post } from "@nestjs/common";
import { CheckoutService } from "./checkout.service.js";

@Controller("checkout")
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post("prepare")
  prepare(@Body() body: any) {
    return this.checkout.prepare(body);
  }
}
