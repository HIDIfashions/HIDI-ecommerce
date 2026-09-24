import assert from "node:assert/strict";
import test from "node:test";
import { ReviewsService } from "../apps/api/src/reviews/reviews.service.js";

function fixture(overrides: { status?: string; existingReview?: any } = {}) {
  const calls: Array<{ name: string; args: any }> = [];
  const record = (name: string, args: any) => calls.push({ name, args: structuredClone(args) });
  const db = {
    orderItem: {
      findFirst: async (args: any) => {
        record("orderItem.findFirst", args);
        return {
          id: "item-1",
          productId: "product-1",
          review: overrides.existingReview ?? null,
          order: {
            id: "order-1",
            status: overrides.status ?? "DELIVERED",
            user: { firstName: "HIDI", lastName: "Customer" },
          },
        };
      },
      count: async (args: any) => {
        record("orderItem.count", args);
        return 1;
      },
    },
    productReview: {
      create: async (args: any) => {
        record("productReview.create", args);
        return {
          id: "review-1",
          ...args.data,
          createdAt: new Date("2026-09-24T00:00:00Z"),
        };
      },
      count: async (args: any) => {
        record("productReview.count", args);
        return 1;
      },
    },
    reviewFollowUp: {
      updateMany: async (args: any) => {
        record("reviewFollowUp.updateMany", args);
        return { count: 1 };
      },
    },
  };
  return { service: new ReviewsService(db as never), calls };
}

test("signed-in account review is ownership-scoped and published as a verified purchase", async () => {
  const { service, calls } = fixture();
  const result = await service.submitAccountReview(
    "user-1",
    "HIDI-ORDER-1",
    "item-1",
    { rating: 5, title: "Loved the fit", body: "The fabric felt soft and the fit was excellent." },
  );

  const lookup = calls.find((call) => call.name === "orderItem.findFirst");
  assert.deepEqual(lookup?.args.where, {
    id: "item-1",
    order: { orderNumber: "HIDI-ORDER-1", userId: "user-1" },
  });

  const create = calls.find((call) => call.name === "productReview.create");
  assert.equal(create?.args.data.verifiedPurchase, true);
  assert.equal(create?.args.data.published, true);
  assert.equal(create?.args.data.reviewerName, "HIDI Customer");
  assert.equal(create?.args.data.orderItemId, "item-1");
  assert.equal(result.rating, 5);
  assert.equal(result.verifiedPurchase, true);

  assert.ok(calls.some((call) => call.name === "reviewFollowUp.updateMany"), "completed order reviews should close follow-up invitations");
});

test("account review rejects pieces before delivery", async () => {
  const { service } = fixture({ status: "SHIPPED" });
  await assert.rejects(
    () => service.submitAccountReview("user-1", "HIDI-ORDER-1", "item-1", { rating: 4, body: "This review is long enough." }),
    /Reviews are available after delivery/,
  );
});

test("account review prevents a second review for the same order item", async () => {
  const { service } = fixture({ existingReview: { id: "existing-review" } });
  await assert.rejects(
    () => service.submitAccountReview("user-1", "HIDI-ORDER-1", "item-1", { rating: 4, body: "This review is long enough." }),
    /already been reviewed/,
  );
});
