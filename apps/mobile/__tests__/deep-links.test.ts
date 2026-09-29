import { parseHidiDeepLink } from "../src/navigation/deepLinks";

describe("HIDI deep links", () => {
  it("accepts HIDI product links", () => {
    expect(parseHidiDeepLink("hidi://products/linen-dress")).toEqual({ type: "product", slug: "linen-dress" });
    expect(parseHidiDeepLink("https://thehidi.com/products/linen-dress?ref=share")).toEqual({ type: "product", slug: "linen-dress" });
  });

  it("accepts guest collection links and derives a safe title", () => {
    expect(parseHidiDeepLink("https://thidigk.thehidi.com/collections/work-edit")).toEqual({
      type: "collection",
      slug: "work-edit",
      title: "Work Edit",
    });
  });

  it("rejects lookalike or unsupported hosts and paths", () => {
    expect(parseHidiDeepLink("https://evil.example/products/linen-dress")).toBeNull();
    expect(parseHidiDeepLink("https://thehidi.com/admin")).toBeNull();
    expect(parseHidiDeepLink("javascript:alert(1)")).toBeNull();
  });
});
