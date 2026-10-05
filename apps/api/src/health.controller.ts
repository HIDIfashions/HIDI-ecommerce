import { PrismaService } from "./prisma/prisma.service.js";
import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("ready")
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1 AS ready`;
      return { status: "ready", service: "hidi-api" };
    } catch {
      throw new ServiceUnavailableException("Database is unavailable");
    }
  }

  @Get()
  health() {
    return {
      status: "ok",
      service: "hidi-api",
      timestamp: new Date().toISOString(),
    };
  }
}

