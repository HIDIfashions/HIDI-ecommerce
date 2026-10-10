import { Controller, Get, UseGuards } from "@nestjs/common";
import { AdminGuard, RequireAdminPermissions } from "../admin/admin-auth.js";
import { OrderNotificationService } from "./order-notification.service.js";
@Controller("admin/order-notifications")
@UseGuards(AdminGuard)
export class OrderNotificationController {
  constructor(private readonly notifications: OrderNotificationService) {}
  @Get()
  @RequireAdminPermissions("order:read")
  status() { return this.notifications.status(); }
}
