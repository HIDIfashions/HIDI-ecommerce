import assert from "node:assert/strict";
import test from "node:test";
import type { VerifiedAuthUser } from "../apps/api/src/auth/supabase-auth.service.js";
import type { PrismaService } from "../apps/api/src/prisma/prisma.service.js";
import { RewardsService } from "../apps/api/src/rewards/rewards.service.js";

const authUser = { id: "auth-123", email: "customer@example.com", metadata: {} } as VerifiedAuthUser;

test("disabled preview never queries customer data", async () => {
  const previous = process.env.HIDI_REWARDS_PREVIEW_ENABLED;
  try {
    delete process.env.HIDI_REWARDS_PREVIEW_ENABLED;
    const service = new RewardsService({} as PrismaService);
    await assert.rejects(service.summary(authUser), /Rewards preview is not enabled/);
  } finally {
    if (previous === undefined) delete process.env.HIDI_REWARDS_PREVIEW_ENABLED;
    else process.env.HIDI_REWARDS_PREVIEW_ENABLED = previous;
  }
});

test("read-only own-account query is bounded and reports truncated estimates", async () => {
  const previousFlag = process.env.HIDI_REWARDS_PREVIEW_ENABLED;
  const previousWindow = process.env.HIDI_REWARD_RETURN_WINDOW_DAYS;
  try {
    process.env.HIDI_REWARDS_PREVIEW_ENABLED = "true";
    process.env.HIDI_REWARD_RETURN_WINDOW_DAYS = "7";
    let lookup: any;
    let query: any;
    const prisma = {
      user: { findUnique: async (args: unknown) => { lookup = args; return { id: "local-user-123" }; } },
      order: { findMany: async (args: unknown) => {
        query = args;
        return Array.from({ length: 101 }, (_, index) => ({
          orderNumber: `ORDER-${index}`, status: "DELIVERED", currency: "INR", createdAt: new Date("2020-01-01"),
          subtotalPaise: 200_000, discountPaise: 0, shippingPaise: 0, taxPaise: 0, totalPaise: 200_000,
          payments: [{ status: "CAPTURED", amountPaise: 200_000 }],
          shipments: [{ status: "DELIVERED", deliveredAt: new Date("2020-01-05") }],
        }));
      } },
    } as unknown as PrismaService;
    const result = await new RewardsService(prisma).summary(authUser);
    assert.deepEqual(lookup, { where: { email: authUser.email }, select: { id: true } });
    assert.deepEqual(query.where.OR, [
      { userId: "local-user-123" },
      { userId: null, customerEmail: { equals: authUser.email } },
    ]);
    assert.equal(query.take, 101);
    assert.equal(query.select.payments.take, 21);
    assert.equal(query.select.shipments.take, 21);
    assert.deepEqual(result.coverage, { latestOrderLimit: 100, includedOrderCount: 100, truncated: true });
    assert.equal(result.mode, "PREVIEW");
    assert.equal(result.spendablePaise, 0);
    assert.equal(result.eligibleEstimatedPaise, 400_000);
    assert.equal(result.policy.redemptionEnabled, false);
  } finally {
    if (previousFlag === undefined) delete process.env.HIDI_REWARDS_PREVIEW_ENABLED;
    else process.env.HIDI_REWARDS_PREVIEW_ENABLED = previousFlag;
    if (previousWindow === undefined) delete process.env.HIDI_REWARD_RETURN_WINDOW_DAYS;
    else process.env.HIDI_REWARD_RETURN_WINDOW_DAYS = previousWindow;
  }
});

test("unmapped verified customer only matches unclaimed guest orders", async () => {
  const previousFlag = process.env.HIDI_REWARDS_PREVIEW_ENABLED;
  try {
    process.env.HIDI_REWARDS_PREVIEW_ENABLED = "true";
    let query: any;
    const prisma = {
      user: { findUnique: async () => null },
      order: { findMany: async (args: unknown) => { query = args; return []; } },
    } as unknown as PrismaService;
    const result = await new RewardsService(prisma).summary(authUser);
    assert.deepEqual(query.where.OR, [{ userId: null, customerEmail: { equals: authUser.email } }]);
    assert.equal(result.spendablePaise, 0);
    assert.equal(result.coverage.truncated, false);
  } finally {
    if (previousFlag === undefined) delete process.env.HIDI_REWARDS_PREVIEW_ENABLED;
    else process.env.HIDI_REWARDS_PREVIEW_ENABLED = previousFlag;
  }
});

test("relation overflow and missing return configuration never become eligible estimates", async () => {
  const previousFlag = process.env.HIDI_REWARDS_PREVIEW_ENABLED;
  const previousWindow = process.env.HIDI_REWARD_RETURN_WINDOW_DAYS;
  try {
    process.env.HIDI_REWARDS_PREVIEW_ENABLED = "true";
    process.env.HIDI_REWARD_RETURN_WINDOW_DAYS = "7";
    const prisma = {
      user: { findUnique: async () => ({ id: "customer-1" }) },
      order: { findMany: async () => [{
        orderNumber: "OVERFLOW", status: "DELIVERED", currency: "INR", createdAt: new Date("2020-01-01"),
        subtotalPaise: 200_000, discountPaise: 0, shippingPaise: 0, taxPaise: 0, totalPaise: 200_000,
        payments: [{ status: "CAPTURED", amountPaise: 200_000 }],
        shipments: Array.from({ length: 21 }, () => ({ status: "DELIVERED", deliveredAt: new Date("2020-01-05") })),
      }] },
    } as unknown as PrismaService;
    const service = new RewardsService(prisma);
    const truncated = await service.summary(authUser);
    assert.equal(truncated.orders[0].reason, "RELATION_LIMIT_EXCEEDED");
    assert.equal(truncated.eligibleEstimatedPaise, 0);
    assert.equal(truncated.heldOrderCount, 1);
    delete process.env.HIDI_REWARD_RETURN_WINDOW_DAYS;
    const missingWindow = await service.summary(authUser);
    assert.equal(missingWindow.policy.returnWindowDays, null);
    assert.equal(missingWindow.orders[0].reason, "RETURN_WINDOW_NOT_CONFIGURED");
    assert.equal(missingWindow.eligibleEstimatedPaise, 0);
  } finally {
    if (previousFlag === undefined) delete process.env.HIDI_REWARDS_PREVIEW_ENABLED;
    else process.env.HIDI_REWARDS_PREVIEW_ENABLED = previousFlag;
    if (previousWindow === undefined) delete process.env.HIDI_REWARD_RETURN_WINDOW_DAYS;
    else process.env.HIDI_REWARD_RETURN_WINDOW_DAYS = previousWindow;
  }
});

