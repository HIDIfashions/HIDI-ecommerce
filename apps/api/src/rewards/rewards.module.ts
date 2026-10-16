import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RewardsController } from "./rewards.controller.js";
import { RewardsService } from "./rewards.service.js";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [RewardsController],
  providers: [RewardsService],
})
export class RewardsModule {}
