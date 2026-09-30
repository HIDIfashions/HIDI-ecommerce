import assert from "node:assert/strict";
import test from "node:test";
import { RetentionService } from "../apps/api/src/retention/retention.service.js";
import { RETENTION_CONSENT_VERSION } from "../apps/api/src/retention/retention-policy.js";

const auth = { id: "verified-auth-subject", email: "owner@example.test", metadata: {}, phone: "+919876543210", phoneVerified: true };

function mockDatabase(initial: Record<string, unknown> | null = null) {
  let profile = initial;
  const calls: { action: string; input: any }[] = [];
  const record = (action: string, input: unknown) => { calls.push({ action, input }); };
  const db: any = {
    retentionProfile: {
      findUnique: async (input: unknown) => { record("profile.find", input); return profile; },
      upsert: async (input: any) => { record("profile.upsert", input); profile = { id: "profile-1", ...(profile ? { ...profile, ...input.update } : input.create) }; return profile; },
    },
    user: { upsert: async (input: unknown) => { record("user.upsert", input); return { id: "user-1" }; } },
    retentionConsentAudit: { create: async (input: unknown) => { record("audit.create", input); return {}; } },
    retentionEvent: { deleteMany: async (input: unknown) => { record("events.delete", input); return { count: 2 }; } },
    retentionDelivery: { updateMany: async (input: unknown) => { record("deliveries.update", input); return { count: 1 }; } },
  };
  db.$transaction = (callback: (tx: any) => Promise<unknown>) => callback(db);
  return { db, calls };
}

test("preferences only look up server-verified subject and return a masked phone", async () => {
  const { db, calls } = mockDatabase({ id: "profile-1", authSubject: auth.id, whatsappOptIn: true, personalizationOptIn: true, consentVersion: RETENTION_CONSENT_VERSION, verifiedPhone: auth.phone });
  const preferences = await new RetentionService(db).preferences(auth);
  assert.equal(preferences.maskedPhone, "•••• 3210");
  assert.equal(preferences.whatsappOptIn, true);
  assert.equal(preferences.sendingEnabled, false);
  assert.deepEqual(calls[0].input, { where: { authSubject: auth.id } });
  assert.equal(JSON.stringify(preferences).includes(auth.phone), false);
});

test("browser-supplied identity and phone fields are rejected", async () => {
  for (const extra of [{ userId: "other" }, { phone: "+919999999999" }, { authSubject: "other" }]) {
    const { db, calls } = mockDatabase();
    await assert.rejects(() => new RetentionService(db).savePreferences(auth, { consentVersion: RETENTION_CONSENT_VERSION, whatsappOptIn: true, personalizationOptIn: true, ...extra }), /Unexpected request field/);
    assert.equal(calls.length, 0);
  }
});

test("user-editable metadata phone is never accepted as verified", async () => {
  const { db, calls } = mockDatabase();
  const unverified = { ...auth, phone: null, phoneVerified: false, metadata: { phone: "+919999999999", phone_verified: true } };
  await assert.rejects(() => new RetentionService(db).savePreferences(unverified, { consentVersion: RETENTION_CONSENT_VERSION, whatsappOptIn: true, personalizationOptIn: true }), /Verify your phone number/);
  assert.equal(calls.length, 0);
});

test("explicit opt-in writes an audit and does not update legacy broad marketing consent", async () => {
  const { db, calls } = mockDatabase();
  await new RetentionService(db).savePreferences(auth, { consentVersion: RETENTION_CONSENT_VERSION, whatsappOptIn: true, personalizationOptIn: true });
  const saved = calls.find((call) => call.action === "profile.upsert")!.input.create;
  assert.equal(saved.authSubject, auth.id);
  assert.equal(saved.userId, "user-1");
  assert.equal(saved.verifiedPhone, auth.phone);
  assert.equal(saved.whatsappOptIn, true);
  assert.equal(saved.personalizationOptIn, true);
  assert.equal(calls.filter((call) => call.action === "audit.create").length, 1);
  assert.deepEqual(calls.find((call) => call.action === "user.upsert")!.input.update, { email: auth.email });
});

test("withdrawal accepts an old version, deletes browsing events and cancels queued sends", async () => {
  const { db, calls } = mockDatabase({ id: "profile-1", authSubject: auth.id, userId: "user-1", whatsappOptIn: true, personalizationOptIn: true, verifiedPhone: auth.phone });
  const result = await new RetentionService(db).savePreferences(auth, { consentVersion: "old-wording", whatsappOptIn: false, personalizationOptIn: false });
  assert.equal(result.whatsappOptIn, false);
  assert.equal(result.personalizationOptIn, false);
  assert.deepEqual(calls.find((call) => call.action === "events.delete")!.input.where, { profileId: "profile-1" });
  assert.deepEqual(calls.find((call) => call.action === "deliveries.update")!.input.data, { status: "CANCELLED" });
});

test("enabling consent with an old version is rejected", async () => {
  const { db, calls } = mockDatabase();
  await assert.rejects(() => new RetentionService(db).savePreferences(auth, { consentVersion: "old-wording", whatsappOptIn: false, personalizationOptIn: true }), /current consent wording/);
  assert.deepEqual(calls.map((call) => call.action), ["profile.find"]);
});

test("stale wording permits partial withdrawal without upgrading remaining consent", async () => {
  const { db, calls } = mockDatabase({ id: "profile-1", authSubject: auth.id, userId: "user-1", whatsappOptIn: true, personalizationOptIn: true, verifiedPhone: auth.phone, consentVersion: "older-grant" });
  const result = await new RetentionService(db).savePreferences(auth, { consentVersion: "older-grant", whatsappOptIn: false, personalizationOptIn: true });
  assert.equal(result.whatsappOptIn, false);
  assert.equal(result.personalizationOptIn, true);
  assert.equal(calls.find((call) => call.action === "profile.upsert")!.input.update.consentVersion, "older-grant");
  assert.equal(calls.find((call) => call.action === "audit.create")!.input.data.consentVersion, "older-grant");
});

test("a different current verified phone does not inherit an older number's opt-in", async () => {
  const { db } = mockDatabase({ id: "profile-1", whatsappOptIn: true, personalizationOptIn: true, consentVersion: RETENTION_CONSENT_VERSION, verifiedPhone: "+919999999999" });
  assert.equal((await new RetentionService(db).preferences(auth)).whatsappOptIn, false);
});

test("tracking and preview are disabled by default and do not touch the database", async () => {
  const before = process.env.RETENTION_ENABLED;
  delete process.env.RETENTION_ENABLED;
  try {
    const service = new RetentionService({} as never);
    assert.deepEqual(await service.track(auth, {}), { recorded: false, reason: "FEATURE_DISABLED" });
    const result = await service.adminPreview();
    assert.equal(result.sendingEnabled, false);
    assert.deepEqual(result.candidates, []);
  } finally {
    if (before === undefined) delete process.env.RETENTION_ENABLED;
    else process.env.RETENTION_ENABLED = before;
  }
});

test("tracking requires explicit personalization consent and ignores broad marketingOptIn", async () => {
  const before = process.env.RETENTION_ENABLED;
  process.env.RETENTION_ENABLED = "true";
  try {
    const { db, calls } = mockDatabase({ id: "profile-1", personalizationOptIn: false, marketingOptIn: true });
    const result = await new RetentionService(db).track(auth, { productId: "product-1", kind: "DETAIL_VIEW" });
    assert.equal(result.recorded, false);
    assert.equal(result.reason, "NO_PERSONALIZATION_CONSENT");
    assert.deepEqual(calls.map((call) => call.action), ["profile.find"]);
  } finally {
    if (before === undefined) delete process.env.RETENTION_ENABLED;
    else process.env.RETENTION_ENABLED = before;
  }
});

test("tracking creates a server episode, deduplicates refreshes and reuses the episode", async () => {
  const before = process.env.RETENTION_ENABLED;
  process.env.RETENTION_ENABLED = "true";
  try {
    const profile = { id: "profile-1", authSubject: auth.id, personalizationOptIn: true, whatsappOptIn: false, consentVersion: RETENTION_CONSENT_VERSION, verifiedPhone: auth.phone };
    const { db, calls } = mockDatabase(profile);
    const events: any[] = [];
    db.product = { findFirst: async () => ({ id: "product-1", variants: [{ id: "variant-1" }] }) };
    db.retentionProfile.updateMany = async () => ({ count: 1 });
    db.retentionEvent.findFirst = async (query: any) => {
      if (query.where.kind) return events.find((event) => event.kind === query.where.kind && event.createdAt >= query.where.createdAt.gte) ?? null;
      return events[events.length - 1] ?? null;
    };
    db.retentionEvent.count = async () => events.length;
    db.retentionEvent.create = async (input: any) => { events.push(input.data); return input.data; };
    const service = new RetentionService(db);
    assert.deepEqual(await service.track(auth, { productId: "product-1", kind: "DETAIL_VIEW" }), { recorded: true });
    assert.match(events[0].episodeKey, /^[0-9a-f-]{36}$/);
    assert.equal(events[0].profileId, "profile-1");
    assert.deepEqual(await service.track(auth, { productId: "product-1", kind: "DETAIL_VIEW" }), { recorded: false, reason: "DUPLICATE_INTERACTION" });
    assert.deepEqual(await service.track(auth, { productId: "product-1", variantId: "variant-1", kind: "SIZE_SELECT" }), { recorded: true });
    assert.equal(events.length, 2);
    assert.equal(events[0].episodeKey, events[1].episodeKey);
    assert.ok(calls.some((call) => call.action === "events.delete"));
  } finally {
    if (before === undefined) delete process.env.RETENTION_ENABLED;
    else process.env.RETENTION_ENABLED = before;
  }
});

test("a concurrent consent withdrawal blocks tracking after the initial read", async () => {
  const before = process.env.RETENTION_ENABLED;
  process.env.RETENTION_ENABLED = "true";
  try {
    const { db } = mockDatabase({ id: "profile-1", personalizationOptIn: true });
    db.product = { findFirst: async () => ({ id: "product-1", variants: [] }) };
    db.retentionProfile.updateMany = async () => ({ count: 0 });
    const result = await new RetentionService(db).track(auth, { productId: "product-1", kind: "DETAIL_VIEW" });
    assert.deepEqual(result, { recorded: false, reason: "NO_PERSONALIZATION_CONSENT" });
  } finally {
    if (before === undefined) delete process.env.RETENTION_ENABLED;
    else process.env.RETENTION_ENABLED = before;
  }
});

test("size events require a real active variant belonging to the selected product", async () => {
  const before = process.env.RETENTION_ENABLED;
  process.env.RETENTION_ENABLED = "true";
  try {
    const { db } = mockDatabase({ id: "profile-1", personalizationOptIn: true });
    db.product = { findFirst: async () => ({ id: "product-1", variants: [{ id: "variant-1" }] }) };
    const service = new RetentionService(db);
    await assert.rejects(() => service.track(auth, { productId: "product-1", kind: "SIZE_SELECT" }), /selected size variant/);
    await assert.rejects(() => service.track(auth, { productId: "product-1", variantId: "other-product-variant", kind: "SIZE_SELECT" }), /Product or size is not available/);
    await assert.rejects(() => service.track(auth, { productId: "product-1", kind: "DETAIL_VIEW", profileId: "other-profile" }), /Unexpected request field/);
  } finally {
    if (before === undefined) delete process.env.RETENTION_ENABLED;
    else process.env.RETENTION_ENABLED = before;
  }
});

for (const scenario of [
  { name: "unclaimed checkout with the verified account email", userId: null, customerEmail: "OWNER@EXAMPLE.TEST", suppress: true },
  { name: "account-linked checkout with a different email", userId: "user-1", customerEmail: "changed@example.test", suppress: true },
  { name: "another account's order even with a matching email", userId: "other-user", customerEmail: auth.email, suppress: false },
  { name: "unclaimed checkout using a different email", userId: null, customerEmail: "other@example.test", suppress: false },
]) {
  test(`preview purchase lookup handles ${scenario.name}`, async () => {
    const before = process.env.RETENTION_ENABLED;
    process.env.RETENTION_ENABLED = "true";
    try {
      const now = Date.now();
      const { db } = mockDatabase();
      const profile = {
        id: "profile-1", userId: "user-1", authSubject: auth.id,
        whatsappOptIn: true, personalizationOptIn: true,
        consentVersion: RETENTION_CONSENT_VERSION,
        verifiedPhone: auth.phone, phoneVerifiedAt: new Date(now - 7 * 86_400_000),
        consentUpdatedAt: new Date(now - 7 * 86_400_000),
        user: { id: "user-1", email: auth.email, carts: [] },
        deliveries: [],
        events: [26, 27].map((hours) => ({ productId: "product-1", variantId: null, kind: "DETAIL_VIEW", episodeKey: "episode1", createdAt: new Date(now - hours * 3_600_000) })),
      };
      db.retentionProfile.findMany = async () => [profile];
      let receivedQuery: any;
      db.order = { findFirst: async (query: any) => {
        receivedQuery = query;
        const matches = query.where.OR.some((condition: any) => condition.userId === "user-1"
          ? scenario.userId === "user-1"
          : scenario.userId === null && scenario.customerEmail.toLowerCase() === condition.customerEmail.equals.toLowerCase());
        return matches ? { createdAt: new Date(now - 3_600_000) } : null;
      } };
      db.product = { findMany: async () => [{
        id: "product-1", slug: "olive-kurta", name: "Olive kurta", status: "ACTIVE",
        variants: [{ id: "variant-1", active: true, pricePaise: 149900, inventory: { onHand: 3, reserved: 0, safetyStock: 0 } }],
      }] };
      const result = await new RetentionService(db).adminPreview();
      assert.equal(result.candidates[0].reason === "PURCHASED_SINCE_ACTIVITY", scenario.suppress);
      assert.equal(result.sendingEnabled, false);
      assert.deepEqual(receivedQuery.where.OR, [
        { userId: "user-1" },
        { userId: null, customerEmail: { equals: auth.email } },
      ]);
      assert.deepEqual(receivedQuery.select, { createdAt: true });
      assert.deepEqual(receivedQuery.where.status.notIn, ["PENDING_PAYMENT", "CANCELLED"]);
      assert.equal(JSON.stringify(result).includes(auth.email), false);
      assert.equal(JSON.stringify(result).includes(auth.phone), false);
    } finally {
      if (before === undefined) delete process.env.RETENTION_ENABLED;
      else process.env.RETENTION_ENABLED = before;
    }
  });
}

