import { Body, Controller, Header, Headers, HttpCode, Post, ServiceUnavailableException } from "@nestjs/common";
import { WhatsAppService } from "./whatsapp.service.js";
import { Msg91WhatsAppService } from "./msg91.service.js";

@Controller("whatsapp")
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService, private readonly msg91: Msg91WhatsAppService) {}

  @Post("msg91/webhook")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async msg91Inbound(@Headers("x-hidi-whatsapp-token") token: string | undefined, @Body() body: unknown) {
    return this.msg91.inbound(token, body);
  }

  @Post("webhook")
  @HttpCode(200)
  @Header("Content-Type", "application/xml; charset=utf-8")
  async inbound(
    @Headers("x-twilio-signature") signature: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    if (!this.whatsapp.enabled() || process.env.WHATSAPP_CHATBOT_PROVIDER === "msg91") {
      throw new ServiceUnavailableException("WhatsApp chatbot is not enabled");
    }
    this.whatsapp.assertValidTwilioWebhook(signature, body);
    return this.whatsapp.handleInbound(body);
  }
}
