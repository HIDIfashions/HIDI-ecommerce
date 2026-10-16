import { Body, Controller, Post } from "@nestjs/common";
import { MarketingService } from "./marketing.service.js";

@Controller("marketing")
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Post("newsletter")
  subscribe(@Body() body: { email?: unknown; source?: unknown }) {
    return this.marketing.subscribeNewsletter(body);
  }
}
