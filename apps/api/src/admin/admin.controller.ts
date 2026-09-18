import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Put, Query, UnauthorizedException } from "@nestjs/common";
import {
  AdminInventoryService,
  type AdjustInventoryInput,
  type StockReceiptInput,
  type VariantImageInput,
} from "./admin-inventory.service.js";
import { AdminService } from "./admin.service.js";
import { ReviewFollowUpService } from "./review-followup.service.js";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly inventory: AdminInventoryService,
    private readonly reviewFollowUps: ReviewFollowUpService,
  ) {}

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

  @Get("review-followups")
  reviewFollowUpList(@Headers("x-admin-key") adminKey?: string) {
    this.requireAdmin(adminKey);
    return this.reviewFollowUps.list();
  }

  @Post("review-followups/run")
  reviewFollowUpRun(@Headers("x-admin-key") adminKey?: string) {
    this.requireAdmin(adminKey);
    return this.reviewFollowUps.runOnce();
  }

  @Get("inventory")
  inventoryList(
    @Headers("x-admin-key") adminKey?: string,
    @Query("q") query?: string,
    @Query("status") status?: string,
  ) {
    this.requireAdmin(adminKey);
    return this.inventory.list(query, status);
  }

  @Get("inventory/receipts")
  inventoryReceipts(@Headers("x-admin-key") adminKey?: string) {
    this.requireAdmin(adminKey);
    return this.inventory.listReceipts();
  }

  @Post("inventory/receipts")
  createInventoryReceipt(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Headers("x-admin-name") adminName: string | undefined,
    @Body() body: StockReceiptInput,
  ) {
    this.requireAdmin(adminKey);
    return this.inventory.createReceipt(body ?? {}, adminName);
  }

  @Post("inventory/receipts/:receiptId/post")
  postInventoryReceipt(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Headers("x-admin-name") adminName: string | undefined,
    @Param("receiptId") receiptId: string,
  ) {
    this.requireAdmin(adminKey);
    return this.inventory.postReceipt(receiptId, adminName);
  }

  @Get("inventory/:variantId/history")
  inventoryHistory(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("variantId") variantId: string,
  ) {
    this.requireAdmin(adminKey);
    return this.inventory.history(variantId);
  }

  @Patch("inventory/:variantId")
  adjustInventory(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Headers("x-admin-name") adminName: string | undefined,
    @Param("variantId") variantId: string,
    @Body() body: AdjustInventoryInput,
  ) {
    this.requireAdmin(adminKey);
    return this.inventory.adjust(variantId, body, adminName);
  }

  @Post("inventory/:variantId/images")
  addInventoryVariantImage(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("variantId") variantId: string,
    @Body() body: VariantImageInput,
  ) {
    this.requireAdmin(adminKey);
    return this.inventory.addVariantImage(variantId, body ?? {});
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
