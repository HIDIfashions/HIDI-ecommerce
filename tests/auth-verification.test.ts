import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
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
  test(`requireUser accepts a verified mobile number with ${label}`, async (t) => {
    const { service } = mockAuth(t, {
      id: verifiedEmailUser.id,
      email,
      email_confirmed_at: emailConfirmedAt,
      phone: "+919999999999",
      phone_confirmed_at: confirmedAt,
      confirmed_at: confirmedAt,
      user_metadata: { email: "customer@example.com", email_verified: true },
    });
    const user = await service.requireUser("Bearer test-session");
    assert.equal(user.email, null);
    assert.equal(user.emailVerified, false);
    assert.equal(user.phone, "+919999999999");
    assert.equal(user.phoneVerified, true);
  });
}

test("requireUser rejects an account with neither a verified mobile number nor verified email", async (t) => {
  const { service } = mockAuth(t, {
    id: verifiedEmailUser.id,
    email: "customer@example.com",
    email_confirmed_at: null,
    phone: "+919999999999",
    phone_confirmed_at: null,
    user_metadata: {},
  });
  await assert.rejects(service.requireUser("Bearer test-session"), {
    name: "UnauthorizedException",
    message: "A verified mobile number or email address is required",
  });
});

test("requireUser returns normalized verified email and forwards the bearer only to Auth", async (t) => {
  const { service, fetchMock } = mockAuth(t);
  const user = await service.requireUser("Bearer test-session");
  assert.deepEqual(user, {
    id: verifiedEmailUser.id,
    email: "customer@example.com",
    emailVerified: true,
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

function mockHidiOtpAuth(t: TestContext, overrides: Record<string, string | undefined> = {}) {
  const managed = new Set([
    "HIDI_AUTH_DEV_OTP",
    "HIDI_AUTH_DEV_OTP_RESPONSE",
    "HIDI_AUTH_SECRET",
    ...Object.keys(overrides),
  ]);
  const previous = Object.fromEntries(
    [...managed].map((key) => [key, process.env[key]]),
  ) as Record<string, string | undefined>;
  process.env.HIDI_AUTH_DEV_OTP = "true";
  process.env.HIDI_AUTH_DEV_OTP_RESPONSE = "true";
  process.env.HIDI_AUTH_SECRET = "test-hidi-auth-secret-with-at-least-32-characters";
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const otps: any[] = [];
  const sessions: any[] = [];
  const users = new Map<string, any>();
  const prisma: any = {
    customerAuthOtp: {
      count: async () => 0,
      create: async ({ data }: any) => {
        const row = { id: `otp-${otps.length + 1}`, attempts: 0, consumedAt: null, createdAt: new Date(), ...data };
        otps.push(row);
        return row;
      },
      findFirst: async ({ where }: any) => [...otps].reverse().find((row) =>
        row.phone === where.phone &&
        row.purpose === where.purpose &&
        row.consumedAt === null &&
        row.expiresAt > where.expiresAt.gt
      ) ?? null,
      update: async ({ where, data }: any) => {
        const row = otps.find((entry) => entry.id === where.id);
        if (data.attempts?.increment) row.attempts += data.attempts.increment;
        if ("consumedAt" in data) row.consumedAt = data.consumedAt;
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const row = otps.find((entry) => entry.id === where.id && entry.consumedAt === where.consumedAt);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    customerAuthSession: {
      create: async ({ data }: any) => {
        sessions.push({ ...data, revokedAt: null, lastUsedAt: null });
        return data;
      },
      findFirst: async ({ where }: any) => sessions.find((row) =>
        row.id === where.id &&
        row.userId === where.userId &&
        row.tokenHash === where.tokenHash &&
        row.revokedAt === null &&
        row.expiresAt > where.expiresAt.gt
      ) ?? null,
      update: async ({ where, data }: any) => {
        const row = sessions.find((entry) => entry.id === where.id);
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const matched = sessions.filter((row) => row.tokenHash === where.tokenHash && row.revokedAt === where.revokedAt);
        matched.forEach((row) => Object.assign(row, data));
        return { count: matched.length };
      },
    },
    user: {
      upsert: async ({ where, create }: any) => {
        const phone = where.phone;
        if (!users.has(phone)) users.set(phone, { id: "user-1", email: null, ...create });
        return users.get(phone);
      },
      findUnique: async ({ where }: any) => [...users.values()].find((user) => user.id === where.id) ?? null,
    },
    walletAccount: { findUnique: async () => null },
    retentionProfile: { findUnique: async () => null },
    $transaction: async (callback: any) => callback(prisma),
  };
  return new SupabaseAuthService(prisma);
}

function signFirebaseIdToken(privateKey: any, payload: Record<string, unknown>, kid = "firebase-test-kid") {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  signer.end();
  return `${header}.${body}.${signer.sign(privateKey).toString("base64url")}`;
}

test("SMS OTP verification creates and rotates HIDI customer sessions", async (t) => {
  const service = mockHidiOtpAuth(t);
  const requested = await service.requestPhoneOtp({ phone: "70937 09353" }) as any;
  assert.equal(requested.phone, "+917093709353");
  assert.match(requested.devOtp, /^\d{6}$/);

  const session = await service.verifyPhoneOtp({ phone: "7093709353", otp: requested.devOtp });
  assert.match(session.access_token, /^hidi_at_/);
  assert.match(session.refresh_token, /^hidi_rt_/);
  assert.deepEqual(session.user, { id: "user-1", email: null, phone: "+917093709353" });

  const user = await service.requireUser(`Bearer ${session.access_token}`);
  assert.equal(user.id, "user-1");
  assert.equal(user.phone, "+917093709353");
  assert.equal(user.phoneVerified, true);

  const refreshed = await service.refresh({ refresh_token: session.refresh_token });
  assert.notEqual(refreshed.refresh_token, session.refresh_token);
  await assert.rejects(() => service.refresh({ refresh_token: session.refresh_token }), {
    name: "UnauthorizedException",
  });

  await service.logout({ refresh_token: refreshed.refresh_token });
  await assert.rejects(() => service.refresh({ refresh_token: refreshed.refresh_token }), {
    name: "UnauthorizedException",
  });
});

test("MSG91 SMS OTP uses the configured OTP template", async (t) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ type: "success", request_id: "msg91-sms-request-1" }), {
      headers: { "content-type": "application/json" },
    });
  });
  const service = mockHidiOtpAuth(t, {
    HIDI_AUTH_DEV_OTP: "false",
    HIDI_AUTH_DEV_OTP_RESPONSE: "false",
    CUSTOMER_OTP_PROVIDER: "msg91",
    MSG91_AUTHKEY: "test-msg91-authkey",
    MSG91_SMS_OTP_TEMPLATE_ID: "test-msg91-template-id",
  });

  const requested = await service.requestPhoneOtp({ phone: "7093709353" }) as any;
  assert.equal(requested.phone, "+917093709353");
  assert.equal(requested.channel, "SMS");
  assert.equal(requested.devOtp, undefined);
  assert.equal(fetchMock.mock.callCount(), 1);

  const url = new URL(calls[0].url);
  assert.equal(`${url.origin}${url.pathname}`, "https://control.msg91.com/api/v5/otp");
  assert.equal(url.searchParams.get("template_id"), "test-msg91-template-id");
  assert.equal(url.searchParams.get("mobile"), "917093709353");
  assert.match(url.searchParams.get("otp") ?? "", /^\d{6}$/);
  assert.equal(url.searchParams.get("otp_length"), "6");
  assert.equal(url.searchParams.get("otp_expiry"), "5");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.redirect, "error");
  assert(calls[0].init.signal instanceof AbortSignal);
  assert.equal((calls[0].init.headers as Record<string, string>).authkey, "test-msg91-authkey");

  const session = await service.verifyPhoneOtp({
    phone: "7093709353",
    otp: url.searchParams.get("otp"),
  });
  assert.match(session.access_token, /^hidi_at_/);
  assert.deepEqual(session.user, { id: "user-1", email: null, phone: "+917093709353" });
});

for (const failure of ["http", "rejected", "empty", "html", "unknown", "network", "timeout"]) {
  test(`MSG91 SMS OTP invalidates the challenge after ${failure}`, async (t) => {
    let sentCode = "";
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
      sentCode = new URL(String(url)).searchParams.get("otp") ?? "";
      assert(init?.signal instanceof AbortSignal);
      if (failure === "network") throw new Error(`provider error ${sentCode} private-test-key`);
      if (failure === "timeout") throw new DOMException("Request timed out", "TimeoutError");
      if (failure === "html") return new Response("<html>Provider unavailable</html>");
      if (failure === "empty") return new Response("");
      return new Response(JSON.stringify({
        type: failure === "rejected" ? "error" : failure === "unknown" ? "queued" : "success",
        request_id: "provider-request",
        message: "private-test-key",
      }), { status: failure === "http" ? 503 : 200 });
    });
    const service = mockHidiOtpAuth(t, {
      HIDI_AUTH_DEV_OTP: "false", HIDI_AUTH_DEV_OTP_RESPONSE: "false",
      CUSTOMER_OTP_PROVIDER: "msg91", MSG91_AUTHKEY: "private-test-key",
      MSG91_SMS_OTP_TEMPLATE_ID: "test-msg91-template-id",
    });
    await assert.rejects(service.requestPhoneOtp({ phone: "9000812818" }), {
      name: "ServiceUnavailableException", message: "Unable to send SMS OTP right now",
    });
    assert.match(sentCode, /^\d{6}$/);
    await assert.rejects(service.verifyPhoneOtp({ phone: "9000812818", otp: sentCode }), {
      name: "UnauthorizedException",
    });
  });
}

for (const endpoint of [
  "http://control.msg91.com/api/v5/otp", "https://example.test/api/v5/otp",
  "https://control.msg91.com@other.test/api/v5/otp", "https://control.msg91.com/api/v5/otp?authkey=unsafe",
]) {
  test(`MSG91 SMS OTP rejects unsafe endpoint ${endpoint}`, async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(""));
    const service = mockHidiOtpAuth(t, {
      HIDI_AUTH_DEV_OTP: "false", HIDI_AUTH_DEV_OTP_RESPONSE: "false", CUSTOMER_OTP_PROVIDER: "msg91",
      MSG91_AUTHKEY: "private-test-key", MSG91_SMS_OTP_TEMPLATE_ID: "test-msg91-template-id",
      MSG91_SMS_OTP_ENDPOINT: endpoint,
    });
    await assert.rejects(service.requestPhoneOtp({ phone: "9000812818" }), {
      name: "ServiceUnavailableException", message: "SMS OTP endpoint is not configured correctly",
    });
    assert.equal(fetchMock.mock.callCount(), 0);
  });
}

test("MSG91 SMS accepts the legacy success acknowledgement and preserves pending proof during rollback", async (t) => {
  let sentCode = "";
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    sentCode = new URL(String(url)).searchParams.get("otp") ?? "";
    return new Response(JSON.stringify({ type: "success", message: "3763646c3058373530393938" }));
  });
  const service = mockHidiOtpAuth(t, {
    HIDI_AUTH_DEV_OTP: "false", HIDI_AUTH_DEV_OTP_RESPONSE: "false", CUSTOMER_OTP_PROVIDER: "msg91",
    MSG91_AUTHKEY: "private-test-key", MSG91_SMS_OTP_TEMPLATE_ID: "test-msg91-template-id",
  });
  await service.requestPhoneOtp({ phone: "9000812818" });
  process.env.CUSTOMER_OTP_PROVIDER = "firebase";
  const session = await service.verifyPhoneOtp({ phone: "9000812818", otp: sentCode });
  assert.match(session.access_token, /^hidi_at_/);
  const refreshed = await service.refresh({ refresh_token: session.refresh_token });
  await service.logout({ refresh_token: refreshed.refresh_token });
  await assert.rejects(service.refresh({ refresh_token: refreshed.refresh_token }), { name: "UnauthorizedException" });
});

function mockMsg91WithFirebaseFallback(t: TestContext, overrides: Record<string, string | undefined> = {}) {
  return mockHidiOtpAuth(t, {
    HIDI_AUTH_DEV_OTP: "false", HIDI_AUTH_DEV_OTP_RESPONSE: "false",
    CUSTOMER_OTP_PROVIDER: "msg91", CUSTOMER_OTP_FALLBACK_PROVIDER: "firebase",
    MSG91_AUTHKEY: "private-test-key", MSG91_SMS_OTP_TEMPLATE_ID: "test-template",
    FIREBASE_PROJECT_ID: "hidi-test-project", ...overrides,
  });
}

test("MSG91 stays primary when its send succeeds with Firebase fallback enabled", async (t) => {
  const service = mockMsg91WithFirebaseFallback(t);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ type: "success", request_id: "test-request" })));
  assert.deepEqual(service.authConfig(), { phoneOtp: true, channel: "SMS", provider: "msg91", fallbackProvider: "firebase" });
  const result = await service.requestPhoneOtp({ phone: "9000812818", provider: "firebase" }) as any;
  assert.equal(result.channel, "SMS");
  assert.equal(result.fallback, undefined);
});

test("failed MSG91 send invalidates its code before authorising Firebase fallback", async (t) => {
  const service = mockMsg91WithFirebaseFallback(t);
  let code = "";
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    code = new URL(String(url)).searchParams.get("otp") ?? "";
    return new Response(JSON.stringify({ type: "error", message: "private provider error" }));
  });
  assert.deepEqual(await service.requestPhoneOtp({ phone: "9000812818" }), {
    phone: "+919000812818", channel: "FIREBASE", provider: "firebase", clientHandled: true, fallback: true,
  });
  await assert.rejects(service.verifyPhoneOtp({ phone: "9000812818", otp: code }), { name: "UnauthorizedException" });
});

test("missing MSG91 credentials use only an explicitly configured Firebase fallback", async (t) => {
  const service = mockMsg91WithFirebaseFallback(t, { MSG91_AUTHKEY: undefined, MSG91_SMS_OTP_TEMPLATE_ID: undefined });
  assert.equal(service.authConfig().provider, "msg91");
  assert.equal(service.authConfig().phoneOtp, true);
  assert.equal((await service.requestPhoneOtp({ phone: "9000812818" }) as any).fallback, true);
  process.env.CUSTOMER_OTP_FALLBACK_PROVIDER = "none";
  assert.equal(service.authConfig().phoneOtp, false);
  await assert.rejects(service.requestPhoneOtp({ phone: "9000812818" }), { name: "ServiceUnavailableException" });
});

test("Firebase fallback never bypasses rate limits or failed challenge invalidation", async (t) => {
  const service = mockMsg91WithFirebaseFallback(t);
  const prisma = (service as any).prisma;
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ type: "error" })));
  t.mock.method(prisma.customerAuthOtp, "count", async () => 5);
  await assert.rejects(service.requestPhoneOtp({ phone: "9000812818" }), /wait before requesting/);
  assert.equal(fetchMock.mock.callCount(), 0);
  t.mock.method(prisma.customerAuthOtp, "count", async () => 0);
  t.mock.method(prisma.customerAuthOtp, "update", async () => { throw new Error("database unavailable"); });
  await assert.rejects(service.requestPhoneOtp({ phone: "9000812818" }), {
    name: "ServiceUnavailableException", message: "Unable to send SMS OTP right now",
  });
});

test("SMS OTP rejects wrong codes and reuse while creating a verified customer session", async (t) => {
  const service = mockHidiOtpAuth(t, { CUSTOMER_OTP_PROVIDER: "msg91" });
  const requested = await service.requestPhoneOtp({ phone: "9999999999" }) as any;
  const wrongCode = requested.devOtp === "000000" ? "000001" : "000000";
  await assert.rejects(service.verifyPhoneOtp({ phone: requested.phone, otp: wrongCode }), { name: "UnauthorizedException" });
  const session = await service.verifyPhoneOtp({ phone: requested.phone, otp: requested.devOtp });
  assert.equal((await service.requireUser(`Bearer ${session.access_token}`)).phoneVerified, true);
  await assert.rejects(service.verifyPhoneOtp({ phone: requested.phone, otp: requested.devOtp }), { name: "UnauthorizedException" });
});

test("SMS OTP locks after five incorrect verification attempts", async (t) => {
  const service = mockHidiOtpAuth(t, { CUSTOMER_OTP_PROVIDER: "msg91" });
  const requested = await service.requestPhoneOtp({ phone: "9999999999" }) as any;
  const wrongCode = requested.devOtp === "000000" ? "000001" : "000000";
  for (let attempt = 0; attempt < 5; attempt++) {
    await assert.rejects(service.verifyPhoneOtp({ phone: requested.phone, otp: wrongCode }), { name: "UnauthorizedException" });
  }
  await assert.rejects(service.verifyPhoneOtp({ phone: requested.phone, otp: requested.devOtp }), /request a new OTP/);
});

test("SMS OTP cannot be verified after its five-minute expiry", async (t) => {
  const service = mockHidiOtpAuth(t, { CUSTOMER_OTP_PROVIDER: "msg91" });
  const requested = await service.requestPhoneOtp({ phone: "9999999999" }) as any;
  const prisma = (service as any).prisma;
  const challenge = await prisma.customerAuthOtp.findFirst({ where: {
    phone: requested.phone, purpose: "SIGN_IN", expiresAt: { gt: new Date("1999-01-01") },
  } });
  challenge.expiresAt = new Date("2000-01-01");
  await assert.rejects(service.verifyPhoneOtp({ phone: requested.phone, otp: requested.devOtp }), { name: "UnauthorizedException" });
});

test("Firebase phone verification creates a HIDI customer session", async (t) => {
  const previousProvider = process.env.CUSTOMER_OTP_PROVIDER;
  const previousProjectId = process.env.FIREBASE_PROJECT_ID;
  process.env.CUSTOMER_OTP_PROVIDER = "firebase";
  process.env.FIREBASE_PROJECT_ID = "hidi-test";
  t.after(() => {
    if (previousProvider === undefined) delete process.env.CUSTOMER_OTP_PROVIDER;
    else process.env.CUSTOMER_OTP_PROVIDER = previousProvider;
    if (previousProjectId === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = previousProjectId;
  });

  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const fetchMock = t.mock.method(globalThis, "fetch", async () => (
    new Response(JSON.stringify({ "firebase-test-kid": publicKeyPem }), {
      headers: {
        "cache-control": "max-age=60",
        "content-type": "application/json",
      },
    })
  ));

  const service = mockHidiOtpAuth(t);
  const now = Math.floor(Date.now() / 1000);
  const idToken = signFirebaseIdToken(privateKey, {
    aud: "hidi-test",
    iss: "https://securetoken.google.com/hidi-test",
    sub: "firebase-user-1",
    iat: now - 10,
    exp: now + 600,
    phone_number: "+91 70937 09353",
    firebase: { sign_in_provider: "phone" },
  });

  const session = await service.verifyPhoneOtp({ provider: "firebase", idToken });
  assert.match(session.access_token, /^hidi_at_/);
  assert.match(session.refresh_token, /^hidi_rt_/);
  assert.deepEqual(session.user, { id: "user-1", email: null, phone: "+917093709353" });
  assert.equal(fetchMock.mock.callCount(), 1);

  const user = await service.requireUser(`Bearer ${session.access_token}`);
  assert.equal(user.id, "user-1");
  assert.equal(user.phone, "+917093709353");
  assert.equal(user.phoneVerified, true);
  assert.equal(user.metadata.auth_provider, "hidi_phone");
});
