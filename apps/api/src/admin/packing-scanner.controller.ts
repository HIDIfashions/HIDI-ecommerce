import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  AdminGuard,
  CurrentAdmin,
  RequireAdminPermissions,
  type AdminActor,
} from "./admin-auth.js";
import { PackingScannerService } from "./packing-scanner.service.js";

@Controller("admin/orders")
@UseGuards(AdminGuard)
export class PackingScannerController {
  constructor(private readonly packingScanner: PackingScannerService) {}

  @Get(":orderNumber/packing")
  @RequireAdminPermissions("order:read")
  plan(@Param("orderNumber") orderNumber: string) {
    return this.packingScanner.plan(orderNumber);
  }

  @Post(":orderNumber/packing/complete")
  @RequireAdminPermissions("order:write")
  complete(
    @CurrentAdmin() actor: AdminActor,
    @Param("orderNumber") orderNumber: string,
    @Body() body: { scannedBarcodes?: unknown },
  ) {
    return this.packingScanner.complete(orderNumber, body?.scannedBarcodes, actor);
  }
}
