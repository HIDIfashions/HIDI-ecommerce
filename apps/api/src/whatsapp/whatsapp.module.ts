import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { WhatsAppController } from "./whatsapp.controller.js";
import { WhatsAppService } from "./whatsapp.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
})
export class WhatsAppModule {}
