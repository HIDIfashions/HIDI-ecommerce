import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { MarketingController } from "./marketing.controller.js";
import { MarketingService } from "./marketing.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [MarketingController],
  providers: [MarketingService],
})
export class MarketingModule {}
