import assert from "node:assert/strict";
import test from "node:test";
import { AdminSupportService } from "../apps/api/src/admin/admin-support.service.js";
import { AdminAuthService, AdminGuard } from "../apps/api/src/admin/admin-auth.js";
import { AdminController } from "../apps/api/src/admin/admin.controller.js";
import { AdminSupportController } from "../apps/api/src/admin/admin-support.controller.js";
import { Reflector } from "../apps/api/node_modules/@nestjs/core/index.js";

const support = { id: "staff-support", displayName: "Support", role: "SUPPORT", authSubject: "auth-support", email: "support@example.test", authMode: "SUPABASE" } as const;
const owner = { ...support, id: "staff-owner", displayName: "Owner", role: "OWNER" } as const;
function fixture() {
  const rows: any[] = [];
  const db = {
    order: { findUnique: async ({ where }: any) => ["HIDI-1", "HIDI-2"].includes(where.orderNumber) ? { id: where.orderNumber === "HIDI-1" ? "order-1" : "order-2" } : null },
    orderAuditEvent: {
      create: async ({ data }: any) => {
        if (data.eventKey && rows.some(row => row.eventKey === data.eventKey)) throw Object.assign(new Error("Unique key"), { code: "P2002" });
        const row = { id: `event-${rows.length + 1}`, createdAt: new Date(), order: { orderNumber: data.orderId === "order-1" ? "HIDI-1" : "HIDI-2" }, ...data };
        rows.push(row); return row;
      },
      findMany: async ({ where }: any) => rows.filter(row => Object.entries(where).every(([key, value]) => typeof value === "object" && value !== null ? (value as any).in.includes(row[key]) : row[key] === value)),
      findFirst: async ({ where }: any) => rows.find(row => Object.entries(where).every(([key, value]) => row[key] === value)),
    },
  };
  return { rows, service: new AdminSupportService(db as any) };
}

test("Support adds immutable notes, tags and dated follow-ups without modifying orders", async () => {
  const { service, rows } = fixture();
  await service.create("HIDI-1", { kind: "NOTE", text: "Called customer", actorId: "spoofed" }, support);
  await service.create("HIDI-1", { kind: "NOTE", text: "Customer replied" }, support);
  await service.create("HIDI-1", { kind: "TAGS", tags: ["Delivery", "delivery"] }, support);
  await service.create("HIDI-1", { kind: "FOLLOW_UP", text: "Call again", status: "OPEN", dueAt: "2026-10-20T10:00:00Z" }, support);
  await service.create("HIDI-1", { kind: "FOLLOW_UP", text: "Resolved", status: "DONE" }, support);
  const history = await service.list("HIDI-1");
  assert.equal(rows.length, 5);
  assert.equal(history.events[0].text, "Called customer");
  assert.equal(history.events[0].actorId, support.id);
  assert.deepEqual(history.events[2].tags, ["delivery"]);
  assert.equal(history.events[4].status, "DONE");
});

test("All four sensitive actions are requests; only Owner can decide, once", async () => {
  for (const type of ["REFUND", "CANCELLATION", "COMPENSATION", "ORDER_CHANGE"]) {
    const { service, rows } = fixture();
    const request = await service.create("HIDI-1", { kind: "APPROVAL_REQUEST", type, text: "Customer requests action", amountPaise: 10000, decision: "APPROVED" }, support);
    assert.equal(JSON.parse(rows[0].metadata).decision, undefined);
    await assert.rejects(service.decide("HIDI-1", request.id, { decision: "APPROVED", text: "Approved" }, support), /Only an Owner/);
    await assert.rejects(service.decide("HIDI-1", request.id, { decision: "APPROVED", text: "Approved" }, { ...support, role: "OPERATIONS" }), /Only an Owner/);
    const results = await Promise.allSettled([
      service.decide("HIDI-1", request.id, { decision: "APPROVED", text: "Reviewed" }, owner),
      service.decide("HIDI-1", request.id, { decision: "REJECTED", text: "Reviewed again" }, owner),
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].actorId, owner.id);
  }
});

test("Invalid support updates and unrelated decision targets fail without writes", async () => {
  const { service, rows } = fixture();
  for (const body of [
    { kind: "NOTE", text: " " }, { kind: "NOTE", text: "a".repeat(2001) },
    { kind: "TAGS", tags: [42] }, { kind: "FOLLOW_UP", status: "OPEN", text: "Call" },
    { kind: "FOLLOW_UP", status: "APPROVED", text: "Call" },
    { kind: "APPROVAL_REQUEST", type: "REFUND", text: "Refund", amountPaise: -1 },
    { kind: "APPROVAL_REQUEST", type: "STAFF", text: "Grant access" }, { kind: "ISSUE_REFUND" },
  ]) await assert.rejects(service.create("HIDI-1", body, support));
  await assert.rejects(service.create("missing", { kind: "NOTE", text: "Note" }, support), /Order not found/);
  await assert.rejects(service.create("HIDI-1", { kind: "NOTE", text: "Note" }, { ...support, role: "CATALOG" }), /Support access required/);
  const note = await service.create("HIDI-1", { kind: "NOTE", text: "Note" }, support);
  await assert.rejects(service.decide("HIDI-1", note.id, { decision: "APPROVED", text: "Reviewed" }, owner), /Approval request not found/);
  await assert.rejects(service.decide("missing", note.id, { decision: "APPROVED", text: "Reviewed" }, owner), /Order not found/);
  assert.equal(rows.length, 1);
  const request = await service.create("HIDI-1", { kind: "APPROVAL_REQUEST", type: "REFUND", text: "Refund" }, support);
  await assert.rejects(service.decide("HIDI-2", request.id, { decision: "APPROVED", text: "Reviewed" }, owner), /Approval request not found/);
  await assert.rejects(service.decide("HIDI-1", request.id, { decision: "APPROVED", text: " " }, owner), /Decision reason/);
  await assert.rejects(service.decide("HIDI-1", request.id, { decision: "DONE", text: "Reviewed" }, owner), /Invalid decision/);
});

test("Support queue shows pending approvals and only the latest unfinished follow-up per order", async () => {
  const { service } = fixture();
  const request = await service.create("HIDI-1", { kind: "APPROVAL_REQUEST", type: "REFUND", text: "Refund" }, support);
  await service.create("HIDI-1", { kind: "FOLLOW_UP", status: "OPEN", text: "Old call", dueAt: "2026-10-20T10:00:00Z" }, support);
  await service.create("HIDI-1", { kind: "FOLLOW_UP", status: "IN_PROGRESS", text: "Latest call", dueAt: "2026-10-21T10:00:00Z" }, support);
  let queue = await service.queue();
  assert.equal(queue.items.length, 2);
  assert.equal(queue.items[1].text, "Latest call");
  assert.equal(queue.items[1].orderNumber, "HIDI-1");
  await service.decide("HIDI-1", request.id, { decision: "REJECTED", text: "Outside policy" }, owner);
  await service.create("HIDI-1", { kind: "FOLLOW_UP", status: "DONE", text: "Resolved" }, support);
  queue = await service.queue();
  assert.equal(queue.items.length, 0);
});

test("Real controller metadata blocks Support direct writes and Owner approval bypasses", async () => {
  const auth = new AdminAuthService({} as any, {} as any);
  const guard = new AdminGuard({ resolveActor: async () => support, hasPermission: auth.hasPermission.bind(auth) } as any, new Reflector());
  const context = (handler: string) => ({
    switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    getHandler: () => ((handler.startsWith("support") ? AdminSupportController : AdminController).prototype as any)[handler], getClass: () => handler.startsWith("support") ? AdminSupportController : AdminController,
  }) as any;
  assert.equal(await guard.canActivate(context("supportUpdate")), true);
  for (const handler of ["updateStatus", "saveShipment", "delhiveryManifest", "updateReturn", "supportDecision", "createStaff"]) {
    await assert.rejects(guard.canActivate(context(handler)), /cannot perform/);
  }
  assert.equal(auth.hasPermission(support, "support:write"), true);
  assert.equal(auth.hasPermission(support, "support:approve"), false);
  assert.equal(auth.hasPermission(owner, "support:approve"), true);
});
