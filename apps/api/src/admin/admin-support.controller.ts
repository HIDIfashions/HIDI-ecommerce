import { Body, Controller, Get, Param, Post, UseGuards, Header } from "@nestjs/common";
import { AdminGuard, CurrentAdmin, RequireAdminPermissions, type AdminActor } from "./admin-auth.js";
import { AdminSupportService } from "./admin-support.service.js";

@Controller("admin")
@UseGuards(AdminGuard)
export class AdminSupportController {
  constructor(private readonly support: AdminSupportService) {}

  @Get("support")
  @Header("Cache-Control", "private, no-store")
  @RequireAdminPermissions("order:read")
  supportQueue() { return this.support.queue(); }

  @Get("orders/:orderNumber/support")
  @Header("Cache-Control", "private, no-store")
  @RequireAdminPermissions("order:read")
  supportHistory(@Param("orderNumber") orderNumber: string) { return this.support.list(orderNumber); }

  @Post("orders/:orderNumber/support")
  @RequireAdminPermissions("support:write")
  supportUpdate(@Param("orderNumber") orderNumber: string, @Body() body: Record<string, unknown>, @CurrentAdmin() actor: AdminActor) {
    return this.support.create(orderNumber, body ?? {}, actor);
  }

  @Post("orders/:orderNumber/support/:requestId/decision")
  @RequireAdminPermissions("support:approve")
  supportDecision(@Param("orderNumber") orderNumber: string, @Param("requestId") requestId: string, @Body() body: Record<string, unknown>, @CurrentAdmin() actor: AdminActor) {
    return this.support.decide(orderNumber, requestId, body ?? {}, actor);
  }
}
