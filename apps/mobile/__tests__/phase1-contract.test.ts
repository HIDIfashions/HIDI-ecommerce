jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn(),
}));

import {
  emptyFilters,
  filterProducts,
  matchesSearch,
  normalizeSearch,
  sortProducts,
} from "../src/data/catalog";
import { screenRegistry } from "../src/spec/screenRegistry";
import type { ApiProduct } from "../src/models/product";

function product(overrides: Partial<ApiProduct> = {}): ApiProduct {
  return {
    id: "p1",
    slug: "linen-dress",
    name: "Linen Dress",
    shortDescription: "Soft everyday dress",
    description: "A relaxed linen style",
    fabric: "Linen",
    category: { id: "c1", name: "Dresses", slug: "dresses" },
    collections: [{ id: "co1", name: "Everyday", slug: "everyday" }],
    images: [],
    variants: [
      { id: "v1", sku: "LD-M-BLUE", size: "M", color: "Blue", mrpPaise: 260000, pricePaise: 240000, available: 3 },
      { id: "v2", sku: "LD-L-RED", size: "L", color: "Red", mrpPaise: 270000, pricePaise: 250000, available: 2 },
    ],
    minPricePaise: 240000,
    maxPricePaise: 250000,
    inStock: true,
    ...overrides,
  };
}

describe("Phase 1 discovery contracts", () => {
  it("keeps H001-H022 as P0 Phase 1 screens", () => {
    const firstPhase = screenRegistry.filter((screen) => screen.phase === 1);
    expect(firstPhase.map((screen) => screen.id)).toEqual(
      Array.from({ length: 22 }, (_, index) => "H" + String(index + 1).padStart(3, "0")),
    );
    expect(firstPhase.every((screen) => screen.priority === "P0")).toBe(true);
  });

  it("normalizes search without depending on token order", () => {
    const item = product();
    expect(normalizeSearch("  LINEN   dress ")).toBe("linen dress");
    expect(matchesSearch(item, "dress linen")).toBe(true);
    expect(matchesSearch(item, "red l")).toBe(true);
    expect(matchesSearch(item, "silk")).toBe(false);
  });

  it("requires one available SKU to satisfy combined size and colour filters", () => {
    const item = product();
    const impossible = { ...emptyFilters, sizes: ["M"], colors: ["Red"] };
    const possible = { ...emptyFilters, sizes: ["M"], colors: ["Blue"] };

    expect(filterProducts([item], impossible)).toEqual([]);
    expect(filterProducts([item], possible)).toEqual([item]);
  });

  it("does not treat out-of-stock variants as filter matches", () => {
    const item = product({
      variants: [
        { id: "v1", sku: "LD-M-BLUE", size: "M", color: "Blue", mrpPaise: 260000, pricePaise: 240000, available: 0 },
      ],
    });
    expect(filterProducts([item], { ...emptyFilters, sizes: ["M"] })).toEqual([]);
  });

  it("keeps unrated items behind genuinely rated items for highest-rated sort", () => {
    const unrated = product({ id: "a", slug: "a", averageRating: undefined });
    const rated = product({ id: "b", slug: "b", averageRating: 4.7 });
    expect(sortProducts([unrated, rated], "rating").map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("keeps recommended sort stable", () => {
    const a = product({ id: "a", slug: "a" });
    const b = product({ id: "b", slug: "b" });
    expect(sortProducts([a, b], "recommended").map((item) => item.id)).toEqual(["a", "b"]);
  });
});
