import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { POST } from "../apps/web/app/api/store/[...path]/route.js";

const originalFetch = globalThis.fetch, originalEnv = { ...process.env };
afterEach(() => { globalThis.fetch = originalFetch; process.env = { ...originalEnv }; });

test("public callback forwards MSG91 authentication and exact body to private API, without forwarding cookies", async () => {
  process.env.INTERNAL_API_URL = "https://private-api.example/v1";
  const body = JSON.stringify({ text: "Customer's SKU & quantity", messages: "[]" });
  globalThis.fetch = async (url: any, options: any) => {
    assert.equal(String(url), "https://private-api.example/v1/whatsapp/msg91/webhook");
    assert.equal(options.headers.get("x-hidi-whatsapp-token"), "fixture-token");
    assert.equal(options.headers.has("cookie"), false);
    assert.equal(Buffer.from(options.body).toString(), body);
    assert.equal(options.redirect, "manual"); assert.equal(options.cache, "no-store");
    return Response.json({ accepted: true });
  };
  const response = await POST(new Request("https://shop.example/api/store/whatsapp/msg91/webhook", { method: "POST", body,
    headers: { "content-type": "application/json", "x-hidi-whatsapp-token": "fixture-token", cookie: "private=value" } }) as any,
    { params: Promise.resolve({ path: ["whatsapp", "msg91", "webhook"] }) });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { accepted: true });
  assert.match(response.headers.get("cache-control")!, /no-store/);
});

test("callback token is scoped to MSG91 route; Razorpay signature forwarding remains intact", async () => {
  for (const path of [["products"], ["payments", "razorpay", "webhook"]]) {
    globalThis.fetch = async (_url: any, options: any) => {
      assert.equal(options.headers.has("x-hidi-whatsapp-token"), false);
      assert.equal(options.headers.get("x-razorpay-signature"), path[0] === "payments" ? "signature" : null);
      return Response.json({ ok: true });
    };
    await POST(new Request("https://shop.example/api/store/" + path.join("/"), { method: "POST", body: "{}",
      headers: { "x-hidi-whatsapp-token": "fixture-token", "x-razorpay-signature": "signature", "content-type": "application/json" } }) as any,
      { params: Promise.resolve({ path }) });
  }
});
