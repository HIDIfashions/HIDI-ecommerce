import { Body, Controller, Get, Header, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { WalletService } from "./wallet.service.js";
import { WalletAdminService } from "./wallet-admin.service.js";

function requireWalletAdmin(key: string | undefined) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || !key || Buffer.byteLength(key) !== Buffer.byteLength(expected)
    || !timingSafeEqual(Buffer.from(key), Buffer.from(expected))) throw new UnauthorizedException("Admin access required");
}

@Controller("wallet")
export class WalletController {
  constructor(private readonly wallet: WalletService, private readonly auth: SupabaseAuthService, private readonly admin: WalletAdminService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async summary(@Headers("authorization") authorization?: string) {
    return this.wallet.getSummary(await this.auth.requireUser(authorization));
  }

  @Post("admin/reconcile")
  @Header("Cache-Control", "private, no-store")
  async reconcile(@Headers("x-admin-key") key: string | undefined, @Body() body: { after?: string; limit?: number } = {}) {
    requireWalletAdmin(key);
    return this.wallet.runMaturationBatch(body?.after, body?.limit);
  }

  @Post("admin/orders/:orderNumber/return-hold")
  @Header("Cache-Control", "private, no-store")
  async returnHold(@Headers("x-admin-key") key: string | undefined, @Param("orderNumber") orderNumber: string, @Body() body: unknown) {
    requireWalletAdmin(key);
    return this.admin.holdReturn(orderNumber, body);
  }

  @Post("admin/orders/:orderNumber/refund-wallet-only")
  @Header("Cache-Control", "private, no-store")
  async refundWalletOnly(@Headers("x-admin-key") key: string | undefined, @Param("orderNumber") orderNumber: string, @Body() body: unknown) {
    requireWalletAdmin(key);
    return this.admin.refundWalletOnlyOrder(orderNumber, body);
  }
}
