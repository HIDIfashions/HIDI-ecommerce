import { request } from "../src/api";

const originalFetch = globalThis.fetch;
afterAll(() => { globalThis.fetch = originalFetch; });
afterEach(() => jest.restoreAllMocks());

describe("mobile API safety", () => {
  it("rejects unsafe paths before a request", async () => {
    const spy = jest.spyOn(globalThis, "fetch");
    await expect(request("https://evil.example")).rejects.toMatchObject({ status: 400 });
    expect(spy).not.toHaveBeenCalled();
  });
  it("does not convert HTML failures into empty content", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 502, headers: { get: () => "text/html" } } as never);
    await expect(request("/products")).rejects.toMatchObject({ status: 502 });
  });
  it("accepts empty 204 cart removals", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 204, headers: { get: () => "" } } as never);
    await expect(request("/carts/a/items/b", { method: "DELETE" })).resolves.toBeUndefined();
  });
});
