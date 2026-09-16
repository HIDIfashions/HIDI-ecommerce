import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Put, Query, UnauthorizedException } from "@nestjs/common";
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

  @Get("orders/:orderNumber")
  order(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("orderNumber") orderNumber: string,
  ) {
    this.requireAdmin(adminKey);
    return this.admin.getOrder(orderNumber);
  }

  @Get("orders/:orderNumber/delhivery/serviceability")
  delhiveryServiceability(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("orderNumber") orderNumber: string,
  ) {
    this.requireAdmin(adminKey);
    return this.admin.checkDelhiveryServiceability(orderNumber);
  }

  @Post("orders/:orderNumber/delhivery/manifest")
  delhiveryManifest(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("orderNumber") orderNumber: string,
  ) {
    this.requireAdmin(adminKey);
    return this.admin.createDelhiveryShipment(orderNumber);
  }

  @Get("orders/:orderNumber/delhivery/track")
  delhiveryTrack(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("orderNumber") orderNumber: string,
  ) {
    this.requireAdmin(adminKey);
    return this.admin.trackDelhivery(orderNumber);
  }

  @Put("orders/:orderNumber/shipment")
  saveShipment(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("orderNumber") orderNumber: string,
    @Body() body: { provider?: string; awb?: string; trackingUrl?: string },
  ) {
    this.requireAdmin(adminKey);
    return this.admin.saveShipment(orderNumber, body ?? {});
  }

  @Patch("orders/:orderNumber/status")
  updateStatus(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("orderNumber") orderNumber: string,
    @Body() body: { status?: string },
  ) {
    this.requireAdmin(adminKey);
    if (!body?.status) throw new BadRequestException("Status is required");
    return this.admin.updateStatus(orderNumber, body.status);
  }
}
