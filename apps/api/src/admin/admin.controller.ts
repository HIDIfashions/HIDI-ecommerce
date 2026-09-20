import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  AdminInventoryService,
  type AdjustInventoryInput,
  type StockReceiptInput,
  type VariantImageInput,
  type VariantImageUploadTicketInput,
} from "./admin-inventory.service.js";
import { AdminService } from "./admin.service.js";
import { ReviewFollowUpService } from "./review-followup.service.js";
import { AdminReturnsService } from "./admin-returns.service.js";
import {
  AdminAuthService,
  AdminGuard,
  CurrentAdmin,
  RequireAdminPermissions,
  type AdminActor,
} from "./admin-auth.js";

@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly inventory: AdminInventoryService,
    private readonly reviewFollowUps: ReviewFollowUpService,
    private readonly returns: AdminReturnsService,
    private readonly adminAuth: AdminAuthService,
  ) {}

  @Get("me")
  me(@CurrentAdmin() actor: AdminActor) {
    return {
      admin: {
        id: actor.id,
        email: actor.email,
        displayName: actor.displayName,
        role: actor.role,
        authMode: actor.authMode,
      },
    };
  }

  @Get("staff")
  @RequireAdminPermissions("staff:manage")
  staffList() {
    return { staff: this.adminAuth.listStaff() };
  }

  @Post("staff")
  @RequireAdminPermissions("staff:manage")
  async createStaff(@Body() body: { email?: unknown; displayName?: unknown; role?: unknown }) {
    return { staff: await this.adminAuth.createStaff(body ?? {}) };
  }

  @Patch("staff/:staffId")
  @RequireAdminPermissions("staff:manage")
  async updateStaff(
    @CurrentAdmin() actor: AdminActor,
    @Param("staffId") staffId: string,
    @Body() body: { displayName?: unknown; role?: unknown; active?: unknown },
  ) {
    return { staff: await this.adminAuth.updateStaff(staffId, body ?? {}, actor) };
  }

  @Get("orders")
  @RequireAdminPermissions("order:read")
  orders(
    @Query("q") query?: string,
    @Query("status") status?: string,
  ) {
    return this.admin.listOrders(query, status);
  }

  @Get("review-followups")
  @RequireAdminPermissions("review:read")
  reviewFollowUpList() {
    return this.reviewFollowUps.list();
  }

  @Post("review-followups/run")
  @RequireAdminPermissions("review:write")
  reviewFollowUpRun() {
    return this.reviewFollowUps.runOnce();
  }

  @Get("inventory")
  @RequireAdminPermissions("inventory:read")
  inventoryList(
    @Query("q") query?: string,
    @Query("status") status?: string,
  ) {
    return this.inventory.list(query, status);
  }

  @Get("inventory/receipts")
  @RequireAdminPermissions("inventory:read")
  inventoryReceipts() {
    return this.inventory.listReceipts();
  }

  @Post("inventory/receipts")
  @RequireAdminPermissions("inventory:write")
  createInventoryReceipt(
    @CurrentAdmin() actor: AdminActor,
    @Body() body: StockReceiptInput,
  ) {
    return this.inventory.createReceipt(body ?? {}, actor.displayName);
  }

  @Post("inventory/receipts/:receiptId/post")
  @RequireAdminPermissions("inventory:write")
  postInventoryReceipt(
    @CurrentAdmin() actor: AdminActor,
    @Param("receiptId") receiptId: string,
  ) {
    return this.inventory.postReceipt(receiptId, actor.displayName);
  }

  @Get("inventory/:variantId/history")
  @RequireAdminPermissions("inventory:read")
  inventoryHistory(@Param("variantId") variantId: string) {
    return this.inventory.history(variantId);
  }

  @Patch("inventory/:variantId")
  @RequireAdminPermissions("inventory:write")
  adjustInventory(
    @CurrentAdmin() actor: AdminActor,
    @Param("variantId") variantId: string,
    @Body() body: AdjustInventoryInput,
  ) {
    return this.inventory.adjust(variantId, body, actor.displayName);
  }

  @Post("inventory/:variantId/images/ticket")
  @RequireAdminPermissions("catalog:write")
  createInventoryVariantImageUploadTicket(
    @Param("variantId") variantId: string,
    @Body() body: VariantImageUploadTicketInput,
  ) {
    return this.inventory.createVariantImageUploadTicket(variantId, body ?? {});
  }

  @Post("inventory/:variantId/images")
  @RequireAdminPermissions("catalog:write")
  addInventoryVariantImage(
    @Param("variantId") variantId: string,
    @Body() body: VariantImageInput,
  ) {
    return this.inventory.addVariantImage(variantId, body ?? {});
  }

  @Delete("inventory/:variantId/images/:imageId")
  @RequireAdminPermissions("catalog:write")
  removeInventoryVariantImage(
    @Param("variantId") variantId: string,
    @Param("imageId") imageId: string,
    @Query("applyToColor") applyToColor?: string,
  ) {
    return this.inventory.removeVariantImage(variantId, imageId, applyToColor === "true");
  }

  @Patch("returns/:requestId")
  @RequireAdminPermissions("return:write")
  updateReturn(
    @CurrentAdmin() actor: AdminActor,
    @Param("requestId") requestId: string,
    @Body() body: {
      action?: unknown;
      note?: unknown;
      rejectionReason?: unknown;
      inventoryDisposition?: unknown;
      provider?: unknown;
      awb?: unknown;
      trackingUrl?: unknown;
    },
  ) {
    return this.returns.update(requestId, body ?? {}, actor);
  }

  @Get("orders/:orderNumber")
  @RequireAdminPermissions("order:read")
  order(@Param("orderNumber") orderNumber: string) {
    return this.admin.getOrder(orderNumber);
  }

  @Get("orders/:orderNumber/delhivery/serviceability")
  @RequireAdminPermissions("order:read")
  delhiveryServiceability(@Param("orderNumber") orderNumber: string) {
    return this.admin.checkDelhiveryServiceability(orderNumber);
  }

  @Post("orders/:orderNumber/delhivery/manifest")
  @RequireAdminPermissions("order:write")
  delhiveryManifest(
    @CurrentAdmin() actor: AdminActor,
    @Param("orderNumber") orderNumber: string,
  ) {
    return this.admin.createDelhiveryShipment(orderNumber, actor);
  }

  @Get("orders/:orderNumber/delhivery/track")
  @RequireAdminPermissions("order:read")
  delhiveryTrack(@Param("orderNumber") orderNumber: string) {
    return this.admin.trackDelhivery(orderNumber);
  }

  @Put("orders/:orderNumber/shipment")
  @RequireAdminPermissions("order:write")
  saveShipment(
    @CurrentAdmin() actor: AdminActor,
    @Param("orderNumber") orderNumber: string,
    @Body() body: { provider?: string; awb?: string; trackingUrl?: string },
  ) {
    return this.admin.saveShipment(orderNumber, body ?? {}, actor);
  }

  @Patch("orders/:orderNumber/status")
  @RequireAdminPermissions("order:write")
  updateStatus(
    @CurrentAdmin() actor: AdminActor,
    @Param("orderNumber") orderNumber: string,
    @Body() body: { status?: string },
  ) {
    if (!body?.status) throw new BadRequestException("Status is required");
    return this.admin.updateStatus(orderNumber, body.status, actor);
  }
}
