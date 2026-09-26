import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, TooManyRequestsException } from "@nestjs/common";
import { CheckoutService } from "./checkout.service.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { DelhiveryService } from "../delhivery/delhivery.service.js";

@Controller("checkout")
export class CheckoutController {
  private readonly deliveryCache = new Map<string, { expiresAt: number; value: any }>();
  private readonly deliveryRate = new Map<string, number[]>();

  constructor(
    private readonly checkout: CheckoutService,
    private readonly auth: SupabaseAuthService,
    private readonly delhivery: DelhiveryService,
  ) {}


  @Get("delivery-serviceability")
  async deliveryServiceability(@Query("pin") rawPin: string, @Req() request: any) {
    const pin = String(rawPin ?? "").trim();
    if (!/^\d{6}$/.test(pin)) throw new BadRequestException("Enter a valid 6-digit PIN code");

    const now = Date.now();
    const clientKey = String(request?.ip ?? request?.headers?.["x-forwarded-for"] ?? "unknown").split(",")[0].trim();
    const recent = (this.deliveryRate.get(clientKey) ?? []).filter((time) => now - time < 60_000);
    if (recent.length >= 20) throw new TooManyRequestsException("Too many PIN checks. Please wait a minute and try again.");
    recent.push(now);
    this.deliveryRate.set(clientKey, recent);

    const cached = this.deliveryCache.get(pin);
    if (cached && cached.expiresAt > now) return cached.value;

    const result = await this.delhivery.checkServiceability(pin);
    const value = {
      pin,
      serviceable: result.prepaid,
      city: result.city ?? null,
      district: result.district ?? null,
      stateCode: result.stateCode ?? null,
    };

    this.deliveryCache.set(pin, { expiresAt: now + 30 * 60_000, value });
    if (this.deliveryCache.size > 500) {
      for (const [key, entry] of this.deliveryCache) {
        if (entry.expiresAt <= now) this.deliveryCache.delete(key);
      }
    }
    return value;
  }

  @Post("prepare")
  async prepare(@Body() body: any, @Headers("authorization") authorization?: string) {
    // An invalid supplied token is never downgraded to anonymous checkout.
    const customer = authorization === undefined ? null : await this.auth.requireUser(authorization);
    return this.checkout.prepare(body, customer);
  }

  @Get("orders")
  orders(@Query("sessionId") sessionId: string) {
    return this.checkout.orders(sessionId);
  }

  @Get("confirmation/:orderNumber")
  confirmation(
    @Param("orderNumber") orderNumber: string,
    @Query("sessionId") sessionId: string,
  ) {
    return this.checkout.confirmation(orderNumber, sessionId);
  }
}
