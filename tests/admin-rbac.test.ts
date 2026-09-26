import assert from "node:assert/strict";
import test from "node:test";
import { AdminAuthService } from "../apps/api/src/admin/admin-auth.js";

function fixture(input: {
  staff?: any[];
  user?: any;
} = {}) {
  const staff = structuredClone(input.staff ?? [{
    id: "admin-1",
    authSubject: null,
    email: "owner@example.test",
    displayName: "Owner",
    role: "OWNER",
    active: true,
    lastLoginAt: null,
  }]);
  const user = input.user ?? {
    id: "auth-admin-1",
    email: "owner@example.test",
    emailVerified: true,
    phone: null,
    phoneVerified: false,
    metadata: {},
  };
  const db: any = {
    adminStaff: {
      findFirst: async (args: any) => {
        return staff.find((row) =>
          args.where.OR.some((condition: any) =>
            Object.entries(condition).every(([key, value]) => row[key] === value),
          ),
        ) ?? null;
      },
      update: async (args: any) => {
        const row = staff.find((entry) => entry.id === args.where.id);
        if (!row) throw new Error("Missing staff");
        Object.assign(row, args.data);
        return structuredClone(row);
      },
      count: async () => staff.length,
      create: async (args: any) => {
        const row = { id: `admin-${staff.length + 1}`, lastLoginAt: null, ...args.data };
        staff.push(row);
        return structuredClone(row);
      },
    },
  };
  const supabase: any = {
    requireUser: async () => structuredClone(user),
  };
  return { service: new AdminAuthService(db, supabase), staff };
}

test("verified staff email claims the Supabase subject once and returns the configured role", async () => {
  const f = fixture();
  const actor = await f.service.resolveActor({ authorization: "Bearer valid" });
  assert.equal(actor.id, "admin-1");
  assert.equal(actor.authSubject, "auth-admin-1");
  assert.equal(actor.role, "OWNER");
  assert.equal(actor.authMode, "SUPABASE");
  assert.equal(f.staff[0].authSubject, "auth-admin-1");
  assert.ok(f.staff[0].lastLoginAt instanceof Date);
});

test("the first owner can be bootstrapped only by the explicitly configured verified email", async () => {
  const before = process.env.ADMIN_BOOTSTRAP_EMAIL;
  try {
    process.env.ADMIN_BOOTSTRAP_EMAIL = "owner@example.test";
    const f = fixture({ staff: [] });
    const actor = await f.service.resolveActor({ authorization: "Bearer valid" });
    assert.equal(actor.role, "OWNER");
    assert.equal(actor.authMode, "SUPABASE");
    assert.equal(f.staff.length, 1);
    assert.equal(f.staff[0].email, "owner@example.test");
    assert.equal(f.staff[0].authSubject, "auth-admin-1");

    const denied = fixture({
      staff: [],
      user: { id: "auth-other", email: "other@example.test", emailVerified: true, metadata: {} },
    });
    await assert.rejects(() => denied.service.resolveActor({ authorization: "Bearer valid" }), { name: "ForbiddenException" });
    assert.equal(denied.staff.length, 0);
  } finally {
    if (before === undefined) delete process.env.ADMIN_BOOTSTRAP_EMAIL;
    else process.env.ADMIN_BOOTSTRAP_EMAIL = before;
  }
});

test("disabled, unknown and subject-conflicting staff cannot enter admin", async () => {
  await assert.rejects(
    () => fixture({ staff: [{ id: "a", authSubject: null, email: "owner@example.test", displayName: "Owner", role: "OWNER", active: false }] }).service.resolveActor({ authorization: "Bearer valid" }),
    { name: "ForbiddenException" },
  );

  await assert.rejects(
    () => fixture({ staff: [] }).service.resolveActor({ authorization: "Bearer valid" }),
    { name: "ForbiddenException" },
  );

  await assert.rejects(
    () => fixture({ staff: [{ id: "a", authSubject: "different-subject", email: "owner@example.test", displayName: "Owner", role: "OWNER", active: true }] }).service.resolveActor({ authorization: "Bearer valid" }),
    { name: "ForbiddenException" },
  );
});

test("admin RBAC permissions separate support, operations, catalog and owner duties", async () => {
  const owner = { id: "1", authSubject: "a", email: "o@example.test", displayName: "Owner", role: "OWNER", authMode: "SUPABASE" } as any;
  const operations = { ...owner, id: "2", role: "OPERATIONS" };
  const support = { ...owner, id: "3", role: "SUPPORT" };
  const catalog = { ...owner, id: "4", role: "CATALOG" };
  const service = fixture().service;

  assert.equal(service.hasPermission(owner, "return:write"), true);
  assert.equal(service.hasPermission(owner, "staff:manage"), true);
  assert.equal(service.hasPermission(operations, "return:write"), true);
  assert.equal(service.hasPermission(operations, "staff:manage"), false);
  assert.equal(service.hasPermission(support, "return:write"), false);
  assert.equal(service.hasPermission(support, "order:read"), true);
  assert.equal(service.hasPermission(catalog, "catalog:write"), true);
  assert.equal(service.hasPermission(catalog, "order:write"), false);
  assert.equal(service.hasPermission(operations, "catalog:write"), false);
});

test("legacy shared key is disabled by default and requires an explicit break-glass flag", async () => {
  const beforeKey = process.env.ADMIN_API_KEY;
  const beforeLegacy = process.env.ADMIN_LEGACY_KEY_ENABLED;
  try {
    process.env.ADMIN_API_KEY = "test-admin-key";
    delete process.env.ADMIN_LEGACY_KEY_ENABLED;

    await assert.rejects(
      () => fixture().service.resolveActor({ adminKey: "test-admin-key" }),
      { name: "UnauthorizedException" },
    );

    process.env.ADMIN_LEGACY_KEY_ENABLED = "true";
    const emergency = await fixture().service.resolveActor({ adminKey: "test-admin-key" });
    assert.equal(emergency.role, "OWNER");
    assert.equal(emergency.authMode, "LEGACY_KEY");
  } finally {
    if (beforeKey === undefined) delete process.env.ADMIN_API_KEY; else process.env.ADMIN_API_KEY = beforeKey;
    if (beforeLegacy === undefined) delete process.env.ADMIN_LEGACY_KEY_ENABLED; else process.env.ADMIN_LEGACY_KEY_ENABLED = beforeLegacy;
  }
});
