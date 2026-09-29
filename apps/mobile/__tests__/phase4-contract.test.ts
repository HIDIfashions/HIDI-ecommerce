import { evidenceRequired, eligibleReturnItems, formatStatus, needsRefundAttention, requestAmountPaise, type AccountOrder, type OrderReturnRequest } from "../src/models/order";
import { phase4Capabilities } from "../src/spec/phase4Capabilities";
import { screenRegistry } from "../src/spec/screenRegistry";

const request: OrderReturnRequest = {
  id: "rr1",
  type: "RETURN",
  reason: "SIZE_FIT",
  quantity: 1,
  refundDestination: "ORIGINAL",
  refundPaise: 120000,
  status: "REFUND_PROCESSING",
  refundWalletPaise: 20000,
  refundCashPaise: 100000,
  createdAt: "2026-09-29T00:00:00Z",
};

function order(overrides: Partial<AccountOrder> = {}): AccountOrder {
  return {
    orderNumber: "HIDI-1001",
    status: "DELIVERED",
    createdAt: "2026-09-29T00:00:00Z",
    deliveredAt: "2026-09-30T00:00:00Z",
    returnWindowEndsAt: "2026-10-07T00:00:00Z",
    canReturnOrExchange: true,
    subtotalPaise: 240000,
    totalPaise: 240000,
    itemCount: 2,
    items: [
      { id: "line-1", productName: "Sage Kurta", slug: "sage-kurta", image: null, size: "M", color: "Sage", quantity: 2, returnableQuantity: 1, unitPricePaise: 120000, totalPaise: 240000, exchangeSizes: ["L", "XL"], review: null, returnRequests: [] },
      { id: "line-2", productName: "Final Saree", slug: "final-saree", image: null, size: "M", color: "Red", quantity: 1, returnableQuantity: 0, unitPricePaise: 99000, totalPaise: 99000, exchangeSizes: [], review: null, returnRequests: [request] },
    ],
    ...overrides,
  };
}

describe("Phase 4 orders and after-sales contracts", () => {
  it("keeps H061-H082 and H128-H131 as Phase 4 P0 screens", () => {
    const phase4 = screenRegistry.filter((screen) => screen.phase === 4).map((screen) => screen.id);
    expect(phase4).toEqual([
      ...Array.from({ length: 22 }, (_, index) => "H" + String(index + 61).padStart(3, "0")),
      "H128", "H129", "H130", "H131",
    ]);
  });

  it("selects only server-eligible return quantities", () => {
    expect(eligibleReturnItems(order()).map((item) => item.id)).toEqual(["line-1"]);
    expect(eligibleReturnItems(order({ canReturnOrExchange: false }))).toEqual([]);
  });

  it("keeps evidence requirements reason-specific", () => {
    expect(evidenceRequired("DAMAGED_DEFECTIVE")).toBe(true);
    expect(evidenceRequired("WRONG_ITEM")).toBe(true);
    expect(evidenceRequired("SIZE_FIT")).toBe(false);
  });

  it("formats statuses without relying on device-specific copy", () => {
    expect(formatStatus("PENDING_PAYMENT")).toBe("Pending Payment");
    expect(formatStatus(null)).toBe("Status unavailable");
  });

  it("sums approved refund channels without double-counting", () => {
    expect(requestAmountPaise(request)).toBe(120000);
    expect(requestAmountPaise({ ...request, refundWalletPaise: 0, refundCashPaise: 0 })).toBe(120000);
  });

  it("routes problematic refunds to attention instead of repeat purchase", () => {
    expect(needsRefundAttention({ ...request, refundStatus: "FAILED" })).toBe(true);
    expect(needsRefundAttention({ ...request, refundStatus: "PROCESSED" })).toBe(false);
  });

  it("does not pretend missing backend capabilities exist", () => {
    expect(phase4Capabilities.orderCancellation).toBe("not-exposed-by-current-order-api");
    expect(phase4Capabilities.invoiceUrl).toBe("not-exposed-by-current-order-api");
    expect(phase4Capabilities.codRefundDestination).toBe("not-exposed-by-current-order-api");
    expect(phase4Capabilities.returnRequest).toBe("existing-api");
  });
});
