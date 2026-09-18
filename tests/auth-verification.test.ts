import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { SupabaseAuthService } from "../apps/api/src/auth/supabase-auth.service.js";

const confirmedAt = "2026-09-01T00:00:00Z";
const verifiedEmailUser = {
  id: "auth-customer-123",
  email: "  Customer@Example.com  ",
  email_confirmed_at: confirmedAt,
};

function mockAuth(t: TestContext, payload: unknown = verifiedEmailUser, status = 200) {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = "https://auth.example.test/";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  t.after(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  });

  const fetchMock = t.mock.method(globalThis, "fetch", async () => (
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    })
  ));
  return { service: new SupabaseAuthService(), fetchMock };
}

test("requireUser rejects missing or non-Bearer credentials without contacting Auth", async (t) => {
  const { service, fetchMock } = mockAuth(t);
  for (const authorization of [undefined, "", "Basic test-session", "bearer test-session"]) {
    await assert.rejects(service.requireUser(authorization), {
      name: "UnauthorizedException",
      message: "Sign in is required",
    });
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("requireUser rejects missing configuration without contacting Auth", async (t) => {
  const { service, fetchMock } = mockAuth(t);
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  await assert.rejects(service.requireUser("Bearer test-session"), {
    name: "ServiceUnavailableException",
    message: "Customer authentication is not configured",
  });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("requireUser rejects a failed Auth response even if it contains a user ID", async (t) => {
  const { service } = mockAuth(t, verifiedEmailUser, 401);
  await assert.rejects(service.requireUser("Bearer test-session"), {
    name: "UnauthorizedException",
    message: "Your sign-in session has expired. Please sign in again.",
  });
});

for (const [label, email, emailConfirmedAt] of [
  ["missing email", undefined, confirmedAt],
  ["null email", null, confirmedAt],
  ["empty email", "", confirmedAt],
  ["whitespace email", "   ", confirmedAt],
  ["missing email confirmation", "customer@example.com", undefined],
  ["null email confirmation", "customer@example.com", null],
  ["empty email confirmation", "customer@example.com", ""],
] as const) {
  test(`requireUser rejects ${label} even with a valid user ID`, async (t) => {
    const { service } = mockAuth(t, {
      id: verifiedEmailUser.id,
      email,
      email_confirmed_at: emailConfirmedAt,
      // A phone confirmation or generic confirmation cannot establish email ownership.
      phone: "+919999999999",
      phone_confirmed_at: confirmedAt,
      confirmed_at: confirmedAt,
      user_metadata: { email: "customer@example.com", email_verified: true },
    });
    await assert.rejects(service.requireUser("Bearer test-session"), {
      name: "UnauthorizedException",
      message: "A verified email address is required",
    });
  });
}

test("requireUser returns normalized verified email and forwards the bearer only to Auth", async (t) => {
  const { service, fetchMock } = mockAuth(t);
  const user = await service.requireUser("Bearer test-session");
  assert.deepEqual(user, {
    id: verifiedEmailUser.id,
    email: "customer@example.com",
    metadata: {},
    phone: null,
    phoneVerified: false,
  });
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.deepEqual(fetchMock.mock.calls[0].arguments, [
    "https://auth.example.test/auth/v1/user",
    { headers: { apikey: "test-publishable-key", Authorization: "Bearer test-session" } },
  ]);
});

test("requireUser returns only the confirmed top-level phone, not a different profile phone", async (t) => {
  const { service } = mockAuth(t, {
    ...verifiedEmailUser,
    phone: "+919999999999",
    phone_confirmed_at: confirmedAt,
    user_metadata: { phone: "+918888888888", phone_verified: true },
  });
  const user = await service.requireUser("Bearer test-session");
  assert.equal(user.phone, "+919999999999");
  assert.equal(user.phoneVerified, true);
  assert.equal(user.metadata.phone, "+918888888888");
});

for (const phoneConfirmedAt of [undefined, null, ""]) {
  test(`requireUser does not verify a top-level phone with ${String(phoneConfirmedAt)} confirmation`, async (t) => {
    const { service } = mockAuth(t, {
      ...verifiedEmailUser,
      phone: "+919999999999",
      phone_confirmed_at: phoneConfirmedAt,
      user_metadata: {
        phone: "+919999999999",
        phone_verified: true,
        phone_confirmed_at: confirmedAt,
      },
    });
    const user = await service.requireUser("Bearer test-session");
    assert.equal(user.phone, null);
    assert.equal(user.phoneVerified, false);
  });
}

for (const phoneConfirmedAt of [undefined, confirmedAt]) {
  test(`requireUser never promotes metadata.phone when top-level phone is absent (${phoneConfirmedAt ? "confirmation present" : "no confirmation"})`, async (t) => {
    const { service } = mockAuth(t, {
      ...verifiedEmailUser,
      phone_confirmed_at: phoneConfirmedAt,
      user_metadata: { phone: "+919999999999", phone_verified: true },
    });
    const user = await service.requireUser("Bearer test-session");
    assert.equal(user.phone, null);
    assert.equal(user.phoneVerified, false);
  });
}

test("requireUser does not log credentials, user data, or failure details", async (t) => {
  const logs = (["log", "info", "warn", "error", "debug"] as const)
    .map((method) => t.mock.method(console, method, () => undefined));
  const { service } = mockAuth(t, {
    ...verifiedEmailUser,
    phone: "+919999999999",
    phone_confirmed_at: confirmedAt,
  });
  await service.requireUser("Bearer private-test-session");
  await assert.rejects(service.requireUser(), { name: "UnauthorizedException" });
  for (const log of logs) assert.equal(log.mock.callCount(), 0);
});
