import { Body, Controller, Header, Headers, HttpCode, Post, ServiceUnavailableException } from "@nestjs/common";
import { WhatsAppService } from "./whatsapp.service.js";

@Controller("whatsapp")
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Post("webhook")
  @HttpCode(200)
  @Header("Content-Type", "application/xml; charset=utf-8")
  async inbound(
    @Headers("x-twilio-signature") signature: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    if (!this.whatsapp.enabled()) {
      throw new ServiceUnavailableException("WhatsApp chatbot is not enabled");
    }
    this.whatsapp.assertValidTwilioWebhook(signature, body);
    return this.whatsapp.handleInbound(body);
  }
}
