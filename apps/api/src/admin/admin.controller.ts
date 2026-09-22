import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, UnauthorizedException } from "@nestjs/common";
import {
  AdminInventoryService,
  type AdjustInventoryInput,
  type StockReceiptInput,
  type VariantImageInput,
  type VariantImageUploadTicketInput,
} from "./admin-inventory.service.js";
import { AdminService } from "./admin.service.js";
import { AdminProcurementService } from "./admin-procurement.service.js";
import { ReviewFollowUpService } from "./review-followup.service.js";
import { AdminReturnsService } from "./admin-returns.service.js";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly inventory: AdminInventoryService,
    private readonly procurement: AdminProcurementService,
    private readonly reviewFollowUps: ReviewFollowUpService,
    private readonly returns: AdminReturnsService,
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

  @Get("procurement")
  procurementDashboard(@Headers("x-admin-key") adminKey?: string) {
    this.requireAdmin(adminKey);
    return this.procurement.dashboard();
  }

  @Post("procurement/vendors")
  createVendor(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Body() body: any,
  ) {
    this.requireAdmin(adminKey);
    return this.procurement.createVendor(body ?? {});
  }

  @Post("procurement/vendor-products")
  saveVendorProduct(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Body() body: any,
  ) {
    this.requireAdmin(adminKey);
    return this.procurement.saveVendorProduct(body ?? {});
  }

  @Get("procurement/material")
  resolveProcurementMaterial(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Query("vendorId") vendorId: string,
    @Query("vendorStyleCode") vendorStyleCode: string,
  ) {
    this.requireAdmin(adminKey);
    return this.procurement.resolveMaterial(vendorId, vendorStyleCode);
  }

  @Post("procurement/purchase-orders")
  createPurchaseOrder(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Headers("x-admin-name") adminName: string | undefined,
    @Body() body: any,
  ) {
    this.requireAdmin(adminKey);
    return this.procurement.createPurchaseOrder(body ?? {}, adminName);
  }

  @Post("procurement/invoices")
  createVendorInvoice(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Body() body: any,
  ) {
    this.requireAdmin(adminKey);
    return this.procurement.createInvoice(body ?? {});
  }

  @Put("procurement/invoice-lines/:invoiceLineId/breakup")
  setVendorInvoiceLineBreakup(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("invoiceLineId") invoiceLineId: string,
    @Body() body: any,
  ) {
    this.requireAdmin(adminKey);
    return this.procurement.setInvoiceLineBreakup(invoiceLineId, body ?? {});
  }

  @Get("procurement/trace/order/:orderNumber")
  traceOrder(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("orderNumber") orderNumber: string,
  ) {
    this.requireAdmin(adminKey);
    return this.procurement.traceOrder(orderNumber);
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

  @Get("inventory/receipts/:receiptId")
  inventoryReceipt(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("receiptId") receiptId: string,
  ) {
    this.requireAdmin(adminKey);
    return this.inventory.getReceipt(receiptId);
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

  @Post("inventory/:variantId/images/ticket")
  createInventoryVariantImageUploadTicket(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("variantId") variantId: string,
    @Body() body: VariantImageUploadTicketInput,
  ) {
    this.requireAdmin(adminKey);
    return this.inventory.createVariantImageUploadTicket(variantId, body ?? {});
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

  @Delete("inventory/:variantId/images/:imageId")
  removeInventoryVariantImage(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("variantId") variantId: string,
    @Param("imageId") imageId: string,
    @Query("applyToColor") applyToColor?: string,
  ) {
    this.requireAdmin(adminKey);
    return this.inventory.removeVariantImage(variantId, imageId, applyToColor === "true");
  }

  @Patch("returns/:requestId")
  updateReturn(
    @Headers("x-admin-key") adminKey: string | undefined,
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
    this.requireAdmin(adminKey);
    return this.returns.update(requestId, body ?? {});
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

  @Post("orders/:orderNumber/scan-pack")
  completeScanPack(
    @Headers("x-admin-key") adminKey: string | undefined,
    @Param("orderNumber") orderNumber: string,
    @Body() body: { scans?: unknown },
  ) {
    this.requireAdmin(adminKey);
    return this.admin.completeScanPack(orderNumber, body ?? {});
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
