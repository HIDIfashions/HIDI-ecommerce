import { hidiRequest, parseRetryAfter } from "../src/network/apiClient";
import { formatINRPaise } from "../src/models/money";
import { parseHidiDeepLink } from "../src/navigation/deepLinks";
import { assertPaymentHandoffAvailable, productionBlockers } from "../src/spec/releaseGates";
const request = jest.fn();
const original = globalThis.fetch;
beforeEach(() => { jest.clearAllMocks(); globalThis.fetch = request; });
afterAll(() => { globalThis.fetch = original; });
function response(status: number, data: unknown, contentType = "application/json", retryAfter: string | null = null) {
  return { status, ok: status >= 200 && status < 300, headers: { get: (name: string) => name === "content-type" ? contentType : name === "retry-after" ? retryAfter : null }, json: async () => data };
}
describe("Phase 8 H103-H116 network failure injection", () => {
  it("preserves JSON content and forwards only fetch options", async () => {
    request.mockResolvedValue(response(200, { items: [] }));
    await expect(hidiRequest("/products", { accessToken: "test-only", timeoutMs: 1000 })).resolves.toEqual({ items: [] });
    const sent = request.mock.calls[0][1];
    expect(sent.accessToken).toBeUndefined(); expect(sent.timeoutMs).toBeUndefined();
    expect(sent.headers.Authorization).toBe("Bearer test-only");
  });
  it("accepts an empty successful DELETE response", async () => {
    request.mockResolvedValue(response(204, undefined, ""));
    await expect(hidiRequest("/carts/test/items/1", { method: "DELETE" })).resolves.toBeUndefined();
  });
  it("never treats an HTML proxy error as an empty catalogue", async () => {
    request.mockResolvedValue(response(503, "maintenance", "text/html"));
    await expect(hidiRequest("/products")).rejects.toMatchObject({ status: 503 });
  });
  it("keeps an unreadable write response ambiguous and never retries POST", async () => {
    request.mockResolvedValue(response(200, "oops", "text/html"));
    await expect(hidiRequest("/checkout/prepare", { method: "POST", body: "{}" })).rejects.toMatchObject({ outcome: "unknown", retryable: false });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("keeps malformed JSON separate from zero results", async () => {
    request.mockResolvedValue({ ...response(200, {}), json: async () => { throw new Error("parse"); } });
    await expect(hidiRequest("/products")).rejects.toMatchObject({ status: 502 });
  });
  it("honors external cancellation before any network call", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(hidiRequest("/products", { signal: controller.signal })).rejects.toMatchObject({ code: "CANCELLED" });
    expect(request).not.toHaveBeenCalled();
  });
  it("forwards cancellation while a read is in flight", async () => {
    request.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("abort")))));
    const controller = new AbortController(); const promise = hidiRequest("/products", { signal: controller.signal }); controller.abort();
    await expect(promise).rejects.toMatchObject({ status: 499, retryable: false });
  });
  it("returns unknown for an offline write instead of an automatic retry", async () => {
    request.mockRejectedValue(new Error("offline"));
    await expect(hidiRequest("/checkout/prepare", { method: "POST" })).rejects.toMatchObject({ status: 0, outcome: "unknown", retryable: false });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("preserves server cooldown without retrying", async () => {
    request.mockResolvedValue(response(429, { message: "Please wait" }, "application/json", "90"));
    await expect(hidiRequest("/products")).rejects.toMatchObject({ status: 429, retryAfterMs: 90000 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(["https://evil.example/x", "//evil.example/x", "../admin", "/products#fragment"])("rejects unsafe request path %s", async path => {
    await expect(hidiRequest(path)).rejects.toMatchObject({ status: 400 }); expect(request).not.toHaveBeenCalled();
  });
  it("bounds retry dates and handles malformed hints", () => {
    expect(parseRetryAfter("garbage")).toBe(0); expect(parseRetryAfter("999999")).toBe(1800000);
    expect(parseRetryAfter("Wed, 30 Sep 2026 06:01:00 GMT", Date.parse("2026-09-30T06:00:00Z"))).toBe(60000);
  });
});
describe("Phase 8 financial display and release guardrails", () => {
  it.each([[129000, "1,290"], [129999, "1,299.99"], [1, "0.01"], [0, "0"]])("preserves paise %s", (amount, text) => expect(formatINRPaise(Number(amount))).toContain(text));
  it("rejects NaN and unsafe integer amounts", () => { expect(formatINRPaise(NaN)).toBe("Amount unavailable"); expect(formatINRPaise(Number.MAX_SAFE_INTEGER + 1)).toBe("Amount unavailable"); });
  it("cannot create a payment without the actual native provider bridge", () => { expect(assertPaymentHandoffAvailable).toThrow("No payment attempt"); expect(productionBlockers()).toContain("nativePaymentHandoff"); });
  it.each(["https://thehidi.com/products/a/extra", "https://thehidi.com@evil.example/products/a", "hidi://products/%2e%2e", "hidi://products/a%2Fb", "https://thehidi.com/products/a\\evil"])("rejects malformed deep link %s", value => expect(parseHidiDeepLink(value)).toBeNull());
});
