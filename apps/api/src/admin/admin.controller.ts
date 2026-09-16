import { Body, Controller, Get, Headers, Param, Patch, Query, UnauthorizedException } from "@nestjs/common";
import { AdminService } from "./admin.service.js";

@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  private requireAdmin(key?: string) {
    const expected = process.env.ADMIN_API_KEY;
    if (!expected || !key || key !== expected) {
      throw new UnauthorizedException("Admin access required");
    }
  }

  @Get("orders")
  orders(
    @Headers("x-admin-key") adminKey?: string,
    @Query("q") query?: string,
    @Query("status") status?: string,
  ) {
    this.requireAdmin(adminKey);
    return this.admin.listOrders(query, status);
  }

  @Patch("orders/:orderNumber/status")
  updateStatus(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("orderNumber") orderNumber: string,
    @Body() body: { status?: string },
  ) {
    this.requireAdmin(adminKey);
    if (!body?.status) throw new UnauthorizedException("Status is required");
    return this.admin.updateStatus(orderNumber, body.status);
  }
}
