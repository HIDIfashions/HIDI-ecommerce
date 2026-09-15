import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  health() {
    return {
      status: "ok",
      service: "hidi-api",
      timestamp: new Date().toISOString(),
    };
  }
}
