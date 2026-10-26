import assert from "node:assert/strict";
import test from "node:test";
import { AdminAuthService } from "../apps/api/src/admin/admin-auth.js";

function fixture(staff: any = null) {
  const requests: Array<{ url: string; options: RequestInit }> = [];
  const lookups: string[] = [];
  const savedFetch = globalThis.fetch;
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = "https://email-service.example.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-public-key";
  globalThis.fetch = (async (url: any, options: RequestInit) => {
    requests.push({ url: String(url), options });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const db: any = { adminStaff: {
    findFirst: async (args: any) => {
      lookups.push(args.where.email);
      if (args.where.OR) return staff;
      return staff?.email === args.where.email ? staff : null;
    },
    create: async () => { throw new Error("Sign-in must never create staff"); },
  } };
  const service = new AdminAuthService(db, { requireUser: async () => ({
    id: "verified-subject", email: staff?.email, emailVerified: true, metadata: {},
  }) } as any);
  return { service, requests, lookups, restore() {
    globalThis.fetch = savedFetch;
    if (savedUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = savedKey;
  } };
}

for (const email of ["unlisted@example.test", "unlisted243@example.test"]) {
  test(`an unlisted ${email} is denied without requesting a code or creating a user`, async () => {
    const f = fixture();
    try {
      await assert.rejects(() => f.service.requestEmailCode({ email }), /not authorised/);
      assert.deepEqual(f.lookups, [email]);
      assert.equal(f.requests.length, 0);
    } finally { f.restore(); }
  });
}

for (const staff of [
  { email: "staff@example.test", role: "OWNER", active: false },
  { email: "staff@example.test", role: "CUSTOMER", active: true },
]) {
  test(`disabled or invalid-role staff are rejected: ${JSON.stringify(staff)}`, async () => {
    const f = fixture(staff);
    try {
      await assert.rejects(() => f.service.requestEmailCode({ email: staff.email }), /not authorised/);
      assert.equal(f.requests.length, 0);
    } finally { f.restore(); }
  });
}

for (const input of [null, [], "staff@example.test", {}, { email: 1 }, { email: "a@@b.test" },
  { email: "staff@example.test", create_user: true }, { email: "staff@example.test", role: "OWNER" }]) {
  test(`invalid or privileged request fields are rejected: ${JSON.stringify(input)}`, async () => {
    const f = fixture();
    try {
      await assert.rejects(() => f.service.requestEmailCode(input), { name: "BadRequestException" });
      assert.equal(f.requests.length, 0);
      assert.equal(f.lookups.length, 0);
    } finally { f.restore(); }
  });
}

test("only eligible staff can provision an email identity; email is normalised", async () => {
  const f = fixture({ id: "staff-1", email: "staff@example.test", role: "CATALOG", active: true });
  try {
    assert.deepEqual(await f.service.requestEmailCode({ email: " STAFF@EXAMPLE.TEST " }), { email: "staff@example.test", retryAfterSeconds: 60 });
    assert.deepEqual(f.lookups, ["staff@example.test"]);
    assert.equal(f.requests.length, 1);
    assert.deepEqual(JSON.parse(String(f.requests[0].options.body)), { email: "staff@example.test", create_user: true });
    assert.equal(f.requests[0].options.redirect, "error");
  } finally { f.restore(); }
});

test("repeated code requests are throttled before provider delivery", async () => {
  const f = fixture({ email: "staff@example.test", role: "OWNER", active: true });
  try {
    await f.service.requestEmailCode({ email: "staff@example.test" });
    await assert.rejects(() => f.service.requestEmailCode({ email: " STAFF@EXAMPLE.TEST " }), (error: any) => error.getStatus() === 429);
    assert.equal(f.requests.length, 1);
  } finally { f.restore(); }
});

test("staff disabled after code delivery cannot establish an admin session", async () => {
  const staff = { email: "staff@example.test", role: "OWNER", active: true };
  const f = fixture(staff);
  try {
    await f.service.requestEmailCode({ email: staff.email });
    staff.active = false;
    await assert.rejects(() => f.service.resolveVerifiedIdentity({ authorization: "Bearer verified" }), /not authorized/);
  } finally { f.restore(); }
});

test("provider and database failures fail closed without exposing provider details", async () => {
  const f = fixture({ email: "staff@example.test", role: "OWNER", active: true });
  try {
    globalThis.fetch = (async () => { throw new Error("private provider diagnostic"); }) as typeof fetch;
    await assert.rejects(() => f.service.requestEmailCode({ email: "staff@example.test" }),
      (error: any) => error.getStatus() === 503 && !error.message.includes("private"));
  } finally { f.restore(); }
  const failing = new AdminAuthService({ adminStaff: { findFirst: async () => { throw new Error("database unavailable"); } } } as any, {} as any);
  await assert.rejects(() => failing.requestEmailCode({ email: "staff@example.test" }), /database unavailable/);
});
