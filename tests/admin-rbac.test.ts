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
    $queryRaw: async (_query: any, id: string) => staff.filter(row => row.id === id).map(row => structuredClone(row)),
    $executeRaw: async (_query: any, json: string, id: string) => { const row=staff.find(row=>row.id===id); if(!row)return 0; row.rolesJson=json;return 1; },
    $transaction: async (work: any) => work(db),
    adminStaff: {
      findUnique: async ({where}: any) => structuredClone(staff.find(row=>row.id===where.id) ?? null),
      findMany: async () => structuredClone(staff),
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
      count: async ({where}: any) => staff.filter(row => row.role===where.role && row.active===where.active).length,
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
  const actor = await f.service.resolveVerifiedIdentity({ authorization: "Bearer valid" });
  assert.equal(actor.id, "admin-1");
  assert.equal(actor.authSubject, "auth-admin-1");
  assert.equal(actor.role, "OWNER");
  assert.equal(actor.authMode, "SUPABASE");
  assert.equal(f.staff[0].authSubject, "auth-admin-1");
  assert.ok(f.staff[0].lastLoginAt instanceof Date);
});

test('multiple roles grant their union without Owner permissions, and persist through staff reads', async () => {
  const f=fixture();
  const created=await f.service.createStaff({email:'catalog-support@example.test',displayName:'Combined Staff',roles:['CATALOG','SUPPORT']});
  assert.deepEqual(created.roles,['SUPPORT','CATALOG']);assert.equal(created.role,'SUPPORT');
  const actor={...created,authMode:'SUPABASE'} as any;
  assert.equal(f.service.hasPermission(actor,'catalog:write'),true);
  assert.equal(f.service.hasPermission(actor,'support:write'),true);
  for(const permission of ['staff:manage','support:approve','order:write','return:write'] as const)assert.equal(f.service.hasPermission(actor,permission),false);
  assert.deepEqual((await f.service.listStaff()).find(row=>row.id===created.id)?.roles,created.roles);
  const updated=await f.service.updateStaff(created.id,{roles:['CATALOG','SUPPORT','OPERATIONS']},{id:'admin-1'} as any);
  assert.deepEqual(updated.roles,['OPERATIONS','SUPPORT','CATALOG']);assert.equal(updated.role,'OPERATIONS');
  assert.equal(f.service.hasPermission({...actor,...updated},'order:write'),true);
  assert.equal(f.service.hasPermission({...actor,...updated},'staff:manage'),false);
});

test('role selection rejects empty, duplicate, unknown, oversized and conflicting requests', async () => {
  const service=fixture().service;
  for(const roles of [[],['SUPPORT','SUPPORT'],['ADMIN'],['OWNER','OPERATIONS','SUPPORT','CATALOG'],'SUPPORT'])
    await assert.rejects(()=>service.createStaff({email:'staff@example.test',displayName:'Staff',roles}),{name:'BadRequestException'});
  await assert.rejects(()=>service.createStaff({email:'staff@example.test',displayName:'Staff',role:'OWNER',roles:['SUPPORT']}),{name:'BadRequestException'});
});

test('role edits preserve self and primary Owner protections', async () => {
  const f=fixture({staff:[{id:'owner',email:'fashionshidi@gmail.com',displayName:'Owner',role:'OWNER',active:true}]});
  await assert.rejects(()=>f.service.updateStaff('owner',{roles:['SUPPORT','CATALOG']},{id:'other'} as any),{name:'ConflictException'});
  await assert.rejects(()=>f.service.updateStaff('owner',{roles:['OWNER','CATALOG']},{id:'owner'} as any),{name:'ConflictException'});
  assert.equal(f.staff[0].role,'OWNER');
});

test("sign-in never bootstraps an unlisted owner, even with a matching configured email", async () => {
  const before = process.env.ADMIN_BOOTSTRAP_EMAIL;
  try {
    process.env.ADMIN_BOOTSTRAP_EMAIL = "owner@example.test";
    const f = fixture({ staff: [] });
    await assert.rejects(() => f.service.resolveVerifiedIdentity({ authorization: "Bearer valid" }), { name: "ForbiddenException" });
    assert.equal(f.staff.length, 0);

    const denied = fixture({
      staff: [],
      user: { id: "auth-other", email: "other@example.test", emailVerified: true, metadata: {} },
    });
    await assert.rejects(() => denied.service.resolveVerifiedIdentity({ authorization: "Bearer valid" }), { name: "ForbiddenException" });
    assert.equal(denied.staff.length, 0);
  } finally {
    if (before === undefined) delete process.env.ADMIN_BOOTSTRAP_EMAIL;
    else process.env.ADMIN_BOOTSTRAP_EMAIL = before;
  }
});

test("disabled, unknown and subject-conflicting staff cannot enter admin", async () => {
  await assert.rejects(
    () => fixture({ staff: [{ id: "a", authSubject: null, email: "owner@example.test", displayName: "Owner", role: "OWNER", active: false }] }).service.resolveVerifiedIdentity({ authorization: "Bearer valid" }),
    { name: "ForbiddenException" },
  );

  await assert.rejects(
    () => fixture({ staff: [] }).service.resolveVerifiedIdentity({ authorization: "Bearer valid" }),
    { name: "ForbiddenException" },
  );

  await assert.rejects(
    () => fixture({ staff: [{ id: "a", authSubject: "different-subject", email: "owner@example.test", displayName: "Owner", role: "OWNER", active: true }] }).service.resolveVerifiedIdentity({ authorization: "Bearer valid" }),
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

test("a linked auth subject does not authorise a different email outside the staff list", async () => {
  const f = fixture({ staff: [{
    id: "admin-1", authSubject: "auth-admin-1", email: "old@example.test",
    displayName: "Owner", role: "OWNER", active: true,
  }] });
  await assert.rejects(() => f.service.resolveVerifiedIdentity({ authorization: "Bearer valid" }), { name: "ForbiddenException" });
  assert.equal(f.staff[0].email, "old@example.test");
});

test("legacy shared key cannot bypass mandatory email OTP", async () => {
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
    await assert.rejects(() => fixture().service.resolveActor({ adminKey: "test-admin-key" }), { name: "UnauthorizedException" });
  } finally {
    if (beforeKey === undefined) delete process.env.ADMIN_API_KEY; else process.env.ADMIN_API_KEY = beforeKey;
    if (beforeLegacy === undefined) delete process.env.ADMIN_LEGACY_KEY_ENABLED; else process.env.ADMIN_LEGACY_KEY_ENABLED = beforeLegacy;
  }
});
