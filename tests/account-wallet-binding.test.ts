import assert from "node:assert/strict";
import test from "node:test";
import { AccountService } from "../apps/api/src/account/account.service.js";

const auth = { id: "auth-customer-1", email: "current@example.test", metadata: {} };

type User = { id: string; email: string; firstName: string | null; lastName: string | null };
type Wallet = { userId: string; authSubject: string };
type Order = { id: string; orderNumber: string; userId: string | null; customerEmail: string; status: string };

function accountFixture(input: {
  users?: User[];
  wallets?: Wallet[];
  orders?: Order[];
  beforeGuestClaim?: (orders: Order[]) => void;
} = {}) {
  const users = structuredClone(input.users ?? []);
  const wallets = structuredClone(input.wallets ?? []);
  const orders = structuredClone(input.orders ?? []);
  const calls: { name: string; args: any }[] = [];
  const record = (name: string, args: unknown) => calls.push({ name, args: structuredClone(args) });
  const findUser = (where: any) => users.find((user) => where.id ? user.id === where.id : user.email === where.email);
  const matches = (order: Order, where: any) =>
    (!where.id?.in || where.id.in.includes(order.id)) &&
    (!Object.hasOwn(where, "userId") || order.userId === where.userId) &&
    (!where.customerEmail || order.customerEmail.toLowerCase() === where.customerEmail.equals.toLowerCase()) &&
    (!where.orderNumber || order.orderNumber === where.orderNumber) &&
    (!where.status?.not || order.status !== where.status.not);
  const db = {
    walletAccount: { findUnique: async (args: any) => {
      record("wallet.findUnique", args);
      return wallets.find((wallet) => args.where.authSubject ? wallet.authSubject === args.where.authSubject : wallet.userId === args.where.userId) ?? null;
    } },
    user: {
      findUnique: async (args: any) => { record("user.findUnique", args); return findUser(args.where) ?? null; },
      findUniqueOrThrow: async (args: any) => {
        record("user.findUniqueOrThrow", args);
        const user = findUser(args.where);
        if (!user) throw new Error("Missing user");
        return structuredClone(user);
      },
      update: async (args: any) => {
        record("user.update", args);
        const user = findUser(args.where)!;
        Object.assign(user, args.data);
        return structuredClone(user);
      },
      upsert: async (args: any) => {
        record("user.upsert", args);
        let user = findUser(args.where);
        if (user) Object.assign(user, args.update);
        else { user = { id: "new-user-1", firstName: null, lastName: null, ...args.create }; users.push(user!); }
        return structuredClone(user);
      },
    },
    order: {
      findMany: async (args: any) => {
        record("order.findMany", args);
        return orders.filter((order) => matches(order, args.where)).map((order) => args.select?.id ? { id: order.id } : {
          ...order, createdAt: new Date("2026-09-01T00:00:00Z"), totalPaise: 100_000, walletAppliedPaise: 5_000,
          payments: [{ status: "CAPTURED" }], items: [],
        });
      },
      updateMany: async (args: any) => {
        record("order.updateMany", args);
        input.beforeGuestClaim?.(orders);
        let count = 0;
        for (const order of orders) if (matches(order, args.where)) { Object.assign(order, args.data); count += 1; }
        return { count };
      },
      findFirst: async (args: any) => {
        record("order.findFirst", args);
        const order = orders.find((entry) => matches(entry, args.where));
        return order ? { id: order.id } : null;
      },
    },
  };
  return { service: new AccountService(db as never), calls, users, wallets, orders };
}

test("existing wallet authSubject binding remains authoritative when verified email changes", async () => {
  const fixture = accountFixture({
    users: [
      { id: "wallet-owner", email: "old@example.test", firstName: "Original", lastName: "Customer" },
      { id: "email-match-other", email: auth.email, firstName: "Other", lastName: "Customer" },
    ],
    wallets: [{ userId: "wallet-owner", authSubject: auth.id }],
    orders: [
      { id: "owned-order", orderNumber: "ORDER-OWNED", userId: "wallet-owner", customerEmail: "old@example.test", status: "DELIVERED" },
      { id: "other-order", orderNumber: "ORDER-OTHER", userId: "email-match-other", customerEmail: auth.email, status: "DELIVERED" },
    ],
  });
  const result = await fixture.service.orders(auth);
  assert.deepEqual(result.orders.map((order) => order.orderNumber), ["ORDER-OWNED"]);
  assert.equal(result.customer.email, auth.email);
  assert.equal(result.customer.firstName, "Original");
  assert.deepEqual(fixture.calls[0], { name: "wallet.findUnique", args: { where: { authSubject: auth.id }, select: { userId: true } } });
  assert.deepEqual(fixture.calls.find((call) => call.name === "user.findUniqueOrThrow")?.args, { where: { id: "wallet-owner" } });
  assert.equal(fixture.calls.some((call) => call.name === "user.upsert"), false);
  const history = fixture.calls.filter((call) => call.name === "order.findMany").at(-1)!;
  assert.equal(history.args.where.userId, "wallet-owner");
});

test("matching an email must not inherit a wallet bound to a different authenticated subject", async () => {
  const existing = { id: "other-wallet-owner", email: auth.email, firstName: "Existing", lastName: "Name" };
  const fixture = accountFixture({
    users: [existing], wallets: [{ userId: existing.id, authSubject: "another-auth-subject" }],
    orders: [{ id: "private-order", orderNumber: "PRIVATE-1", userId: existing.id, customerEmail: auth.email, status: "DELIVERED" }],
  });
  await assert.rejects(fixture.service.orders({ ...auth, metadata: { first_name: "Untrusted overwrite", last_name: "Blocked" } }), {
    name: "ConflictException", message: "This account requires support review before linking order history",
  });
  assert.equal(fixture.calls.some((call) => call.name.startsWith("order.")), false);
  // Rejecting history access is not enough: an identity collision must not
  // mutate the existing wallet owner's profile before the authorization check.
  assert.deepEqual(fixture.users, [existing]);
});

test("guest claim writes repeat both unclaimed ownership and current verified email guards", async () => {
  const owner = { id: "wallet-owner", email: "old@example.test", firstName: "A", lastName: "Customer" };
  const fixture = accountFixture({
    users: [owner], wallets: [{ userId: owner.id, authSubject: auth.id }],
    orders: [
      { id: "guest-a", orderNumber: "GUEST-A", userId: null, customerEmail: "CURRENT@EXAMPLE.TEST", status: "DELIVERED" },
      { id: "guest-b", orderNumber: "GUEST-B", userId: null, customerEmail: auth.email, status: "DELIVERED" },
      { id: "guest-c", orderNumber: "GUEST-C", userId: null, customerEmail: auth.email, status: "DELIVERED" },
      { id: "old-email-guest", orderNumber: "GUEST-OLD", userId: null, customerEmail: owner.email, status: "DELIVERED" },
      { id: "already-owned", orderNumber: "OTHER-OWNED", userId: "another-owner", customerEmail: auth.email, status: "DELIVERED" },
    ],
    beforeGuestClaim: (orders) => {
      orders.find((order) => order.id === "guest-b")!.userId = "winner-of-race";
      orders.find((order) => order.id === "guest-c")!.customerEmail = "corrected-owner@example.test";
    },
  });
  const result = await fixture.service.orders(auth);
  const claim = fixture.calls.find((call) => call.name === "order.updateMany")!;
  assert.deepEqual(claim.args, {
    where: { id: { in: ["guest-a", "guest-b", "guest-c"] }, userId: null, customerEmail: { equals: auth.email, mode: "insensitive" } },
    data: { userId: owner.id },
  });
  assert.equal(fixture.orders.find((order) => order.id === "guest-a")!.userId, owner.id);
  assert.equal(fixture.orders.find((order) => order.id === "guest-b")!.userId, "winner-of-race");
  assert.equal(fixture.orders.find((order) => order.id === "guest-c")!.userId, null);
  assert.equal(fixture.orders.find((order) => order.id === "old-email-guest")!.userId, null);
  assert.equal(fixture.orders.find((order) => order.id === "already-owned")!.userId, "another-owner");
  assert.deepEqual(result.orders.map((order) => order.orderNumber), ["GUEST-A"]);
});

test("ownsOrder uses wallet-bound local identity and cannot authorize another email-matched owner's order", async () => {
  const fixture = accountFixture({
    users: [{ id: "wallet-owner", email: "old@example.test", firstName: null, lastName: null }],
    wallets: [{ userId: "wallet-owner", authSubject: auth.id }],
    orders: [
      { id: "own", orderNumber: "ORDER-OWN", userId: "wallet-owner", customerEmail: "old@example.test", status: "DELIVERED" },
      { id: "other", orderNumber: "ORDER-OTHER", userId: "someone-else", customerEmail: auth.email, status: "DELIVERED" },
    ],
  });
  assert.equal(await fixture.service.ownsOrder(auth, "ORDER-OWN"), true);
  await assert.rejects(fixture.service.ownsOrder(auth, "ORDER-OTHER"), { name: "NotFoundException", message: "Order not found" });
  const lookups = fixture.calls.filter((call) => call.name === "order.findFirst");
  assert.deepEqual(lookups.map((call) => call.args.where), [
    { orderNumber: "ORDER-OWN", userId: "wallet-owner" }, { orderNumber: "ORDER-OTHER", userId: "wallet-owner" },
  ]);
});
