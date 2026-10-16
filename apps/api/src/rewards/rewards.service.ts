import { Injectable, NotFoundException } from "@nestjs/common";
import type { VerifiedAuthUser } from "../auth/supabase-auth.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  parseReturnWindowDays,
  projectRewardPreview,
  REWARD_PREVIEW_ORDER_LIMIT,
  REWARD_PREVIEW_RELATION_LIMIT,
  summarizeRewardPreview,
} from "./reward-preview.js";

@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(authUser: VerifiedAuthUser) {
    if (process.env.HIDI_REWARDS_PREVIEW_ENABLED !== "true") throw new NotFoundException("Rewards preview is not enabled");
    const returnWindowDays = parseReturnWindowDays(process.env.HIDI_REWARD_RETURN_WINDOW_DAYS);
    // Never accept identity fields from the request. requireUser verifies the
    // bearer token with Supabase Auth; only verified phone/email values are used.
    const verifiedPhone = authUser.phoneVerified && authUser.phone ? authUser.phone : null;
    const verifiedEmail = authUser.email ?? null;
    const user = verifiedPhone
      ? await this.prisma.user.findUnique({ where: { phone: verifiedPhone }, select: { id: true } })
      : verifiedEmail
        ? await this.prisma.user.findUnique({ where: { email: verifiedEmail }, select: { id: true } })
        : null;

    const orders = await this.prisma.order.findMany({
      where: {
        OR: [
          ...(user ? [{ userId: user.id }] : []),
          ...(verifiedPhone ? [{ userId: null, customerPhone: verifiedPhone }] : []),
          ...(verifiedEmail ? [{ userId: null, customerEmail: { equals: verifiedEmail } }] : []),
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: REWARD_PREVIEW_ORDER_LIMIT + 1,
      select: {
        orderNumber: true,
        status: true,
        currency: true,
        createdAt: true,
        subtotalPaise: true,
        discountPaise: true,
        shippingPaise: true,
        taxPaise: true,
        totalPaise: true,
        payments: {
          orderBy: { id: "asc" },
          take: REWARD_PREVIEW_RELATION_LIMIT + 1,
          select: { status: true, amountPaise: true },
        },
        shipments: {
          orderBy: { id: "asc" },
          take: REWARD_PREVIEW_RELATION_LIMIT + 1,
          select: { status: true, deliveredAt: true },
        },
      },
    });
    const now = new Date();
    const entries = orders.slice(0, REWARD_PREVIEW_ORDER_LIMIT).map((order) => projectRewardPreview({
      ...order,
      relationsComplete: order.payments.length <= REWARD_PREVIEW_RELATION_LIMIT
        && order.shipments.length <= REWARD_PREVIEW_RELATION_LIMIT,
    }, returnWindowDays, now));
    return {
      mode: "PREVIEW" as const,
      currency: "INR" as const,
      spendablePaise: 0,
      ...summarizeRewardPreview(entries),
      orders: entries,
      policy: {
        returnWindowDays,
        basis: "ILLUSTRATIVE_SUBTOTAL_MINUS_DISCOUNT_EXCLUDING_SHIPPING" as const,
        pointsPerComplete100Rupees: 2,
        paisePerPoint: 100,
        eligibilityTermsApproved: false,
        redemptionEnabled: false,
      },
      coverage: {
        latestOrderLimit: REWARD_PREVIEW_ORDER_LIMIT,
        includedOrderCount: entries.length,
        truncated: orders.length > REWARD_PREVIEW_ORDER_LIMIT,
      },
      notice: "Illustrative estimates only, not wallet balances. No rewards have been credited and nothing can be spent. Final eligible spend, return window, expiry, redemption and offer rules require approval.",
    };
  }
}

