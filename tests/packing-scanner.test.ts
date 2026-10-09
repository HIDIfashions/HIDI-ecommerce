import assert from "node:assert/strict";
import test from "node:test";
import { PackingScannerService } from "../apps/api/src/admin/packing-scanner.service.ts";

const actor = {
  id: "admin_1",
  email: "ops@thehidi.com",
  displayName: "Packing Team",
  role: "OWNER",
  authMode: "SESSION",
} as any;

function fixture(status = "CONFIRMED") {
  return {
    id: "order_1",
    orderNumber: "HIDI-TEST-1",
    status,
    createdAt: new Date("2026-10-09T05:00:00Z"),
    customerPhone: "9000000000",
    totalPaise: 499800,
    items: [
      {
        id: "item_1",
        variantId: "cm1234567890abcdef",
        sku: "HIDI-KURTA-M",
        productName: "HIDI Kurta",
        size: "M",
        color: "Mulberry",
        quantity: 1,
        product: { images: [{ url: "https://example.com/m.jpg" }] },
      },
      {
        id: "item_2",
        variantId: "cm0987654321fedcba",
        sku: "HIDI-KURTA-XL",
        productName: "HIDI Kurta",
        size: "XL",
        color: "Mulberry",
        quantity: 2,
        product: { images: [{ url: "https://example.com/xl.jpg" }] },
      },
    ],
  };
}

function harness(status = "CONFIRMED") {
  const order = fixture(status);
  const audit: any[] = [];
  const updates: any[] = [];
  const prisma: any = {
    order: {
      findUnique: async () => order,
    },
    $transaction: async (operation: any) => operation({
      order: {
        updateMany: async (args: any) => {
          updates.push(args);
          return { count: status === "CONFIRMED" ? 1 : 0 };
        },
      },
      orderAuditEvent: {
        create: async (args: any) => {
          audit.push(args.data);
          return args.data;
        },
      },
    }),
  };
  return { service: new PackingScannerService(prisma), order, audit, updates };
}

test("packing plan emits stable HIDI barcodes and physical piece count", async () => {
  const { service } = harness();
  const result = await service.plan("HIDI-TEST-1");
  assert.equal(result.order.itemCount, 3);
  assert.equal(result.order.items.length, 2);
  assert.match(result.order.items[0].barcode, /^H[A-Z0-9]{12}$/);
  assert.equal(result.order.items[1].quantity, 2);
});

test("exact physical scans move CONFIRMED to PACKED and audit scanner source", async () => {
  const { service, audit, updates } = harness();
  const plan = await service.plan("HIDI-TEST-1");
  const scans = [
    plan.order.items[0].barcode,
    plan.order.items[1].barcode,
    plan.order.items[1].barcode,
  ];

  const result = await service.complete("HIDI-TEST-1", scans, actor);
  assert.equal(result.status, "PACKED");
  assert.equal(result.scannedPieces, 3);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].where.status, "CONFIRMED");
  assert.equal(updates[0].data.status, "PACKED");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].eventType, "ORDER_PACKED");
  assert.equal(audit[0].source, "PACKING_SCANNER");
  assert.equal(audit[0].metadata.scannedPieces, 3);
});

test("wrong item cannot pack an order", async () => {
  const { service, updates } = harness();
  const plan = await service.plan("HIDI-TEST-1");
  await assert.rejects(
    service.complete("HIDI-TEST-1", [
      plan.order.items[0].barcode,
      plan.order.items[1].barcode,
      "H000000000000",
    ], actor),
    /Wrong item scanned/,
  );
  assert.equal(updates.length, 0);
});

test("missing or excess quantities cannot pack an order", async () => {
  const { service, updates } = harness();
  const plan = await service.plan("HIDI-TEST-1");
  await assert.rejects(
    service.complete("HIDI-TEST-1", [
      plan.order.items[0].barcode,
      plan.order.items[1].barcode,
    ], actor),
  );
  assert.equal(updates.length, 0);
});

test("already packed request is idempotent and performs no write", async () => {
  const { service, updates } = harness("PACKED");
  const plan = await service.plan("HIDI-TEST-1");
  const result = await service.complete("HIDI-TEST-1", [
    plan.order.items[0].barcode,
    plan.order.items[1].barcode,
    plan.order.items[1].barcode,
  ], actor);
  assert.equal(result.alreadyPacked, true);
  assert.equal(updates.length, 0);
});
