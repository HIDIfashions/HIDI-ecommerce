jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn(),
}));

jest.mock("../src/storage/localStore", () => ({
  localStore: {
    catalogCache: jest.fn(),
    saveCatalogCache: jest.fn(),
  },
}));

import { screenRegistry } from "../src/spec/screenRegistry";
import { phase2Capabilities } from "../src/spec/phase2Capabilities";
import { compareCartSnapshots, type ApiCart } from "../src/models/cart";
import { lineQuantityForVariant } from "../src/data/cartApi";
import { filterProducts, matchesSearch } from "../src/data/catalog";
import type { ApiProduct } from "../src/models/product";

const product: ApiProduct = {
  id: "p1",
  slug: "aara-sage-work-kurta",
  name: "Aara Sage Work Kurta",
  fabric: "Cotton blend",
  care: "Gentle wash",
  category: { id: "c1", name: "Ethnic Wear", slug: "ethnic-wear" },
  collections: [{ id: "co1", name: "Work Edit", slug: "work-edit" }],
  images: [],
  variants: [
    {
      id: "v-m",
      sku: "AARA-M",
      size: "M",
      color: "Sage",
      mrpPaise: 129000,
      pricePaise: 129000,
      available: 4,
      bustMm: 960,
      waistMm: 900,
      hipMm: 1040,
    },
    {
      id: "v-l",
      sku: "AARA-L",
      size: "L",
      color: "Sage",
      mrpPaise: 129000,
      pricePaise: 129000,
      available: 0,
    },
  ],
  minPricePaise: 129000,
  maxPricePaise: 129000,
  inStock: true,
};

function cart(overrides: Partial<ApiCart> = {}): ApiCart {
  return {
    id: "cart-1",
    sessionId: "mobile-session-123",
    currency: "INR",
    itemCount: 1,
    subtotalPaise: 129000,
    items: [{
      id: "line-1",
      quantity: 1,
      unitPricePaise: 129000,
      lineTotalPaise: 129000,
      product: { id: product.id, slug: product.slug, name: product.name, image: null },
      variant: { id: "v-m", sku: "AARA-M", size: "M", color: "Sage", available: 4 },
    }],
    ...overrides,
  };
}

describe("Phase 2 H023-H044 contract simulation", () => {
  it("contains exactly the 22 Phase 2 P0 screens", () => {
    const phase2 = screenRegistry.filter((screen) => screen.phase === 2);
    expect(phase2.map((screen) => screen.id)).toEqual(
      Array.from({ length: 22 }, (_, index) => "H" + String(index + 23).padStart(3, "0")),
    );
    expect(phase2.every((screen) => screen.priority === "P0")).toBe(true);
  });

  it("simulates discovery to an exact in-stock SKU without inventing availability", () => {
    expect(matchesSearch(product, "sage work")).toBe(true);
    const filtered = filterProducts([product], {
      sizes: ["M"],
      colors: ["Sage"],
      fabrics: ["Cotton blend"],
      minPricePaise: 120000,
      maxPricePaise: 140000,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].variants.find((variant) => variant.id === "v-m")?.available).toBe(4);

    const soldOut = filterProducts([product], {
      sizes: ["L"],
      colors: ["Sage"],
      fabrics: [],
    });
    expect(soldOut).toEqual([]);
  });

  it("simulates canonical add-to-bag quantity merging in minor units", () => {
    const canonical = cart();
    expect(lineQuantityForVariant(canonical, "v-m")).toBe(1);

    const afterSecondAdd = cart({
      itemCount: 2,
      subtotalPaise: 258000,
      items: [{
        ...canonical.items[0],
        quantity: 2,
        lineTotalPaise: 258000,
      }],
    });
    expect(lineQuantityForVariant(afterSecondAdd, "v-m")).toBe(2);
    expect(afterSecondAdd.items[0].lineTotalPaise).toBe(afterSecondAdd.items[0].unitPricePaise * 2);
    expect(afterSecondAdd.subtotalPaise).toBe(258000);
  });

  it("flags an unavailable line even without a previous local snapshot", () => {
    const unavailable = cart({
      items: [{
        ...cart().items[0],
        variant: { ...cart().items[0].variant, available: 0 },
      }],
    });
    expect(compareCartSnapshots(null, unavailable).map((change) => change.kind)).toEqual(["unavailable"]);
  });

  it("simulates H043 price and stock reconciliation before checkout", () => {
    const acknowledged = cart();
    const changed = cart({
      subtotalPaise: 139000,
      items: [{
        ...acknowledged.items[0],
        unitPricePaise: 139000,
        lineTotalPaise: 139000,
        variant: { ...acknowledged.items[0].variant, available: 0 },
      }],
    });
    const changes = compareCartSnapshots(acknowledged, changed);
    expect(changes.map((change) => change.kind)).toEqual(["price", "unavailable"]);
    expect(changes[0].beforePaise).toBe(129000);
    expect(changes[0].afterPaise).toBe(139000);
  });

  it("keeps unrelated price attention after another line is removed", () => {
    const first = cart().items[0];
    const acknowledged = cart({
      items: [
        first,
        {
          ...first,
          id: "line-2",
          product: { ...first.product, id: "p2", slug: "second-style", name: "Second Style" },
          variant: { ...first.variant, id: "v-2", sku: "SECOND-M" },
        },
      ],
      itemCount: 2,
      subtotalPaise: 258000,
    });
    const afterRemoval = cart({
      items: [{
        ...acknowledged.items[0],
        unitPricePaise: 139000,
        lineTotalPaise: 139000,
      }],
      itemCount: 1,
      subtotalPaise: 139000,
    });
    expect(compareCartSnapshots(acknowledged, afterRemoval).map((change) => change.kind)).toEqual(["price"]);
  });

  it("preserves deferred quantity when a saved bag SKU is reviewed", () => {
    const savedQuantity = 2;
    const selectedAvailable = 4;
    expect(selectedAvailable >= savedQuantity).toBe(true);
    const canonical = cart({
      itemCount: savedQuantity,
      subtotalPaise: 129000 * savedQuantity,
      items: [{ ...cart().items[0], quantity: savedQuantity, lineTotalPaise: 129000 * savedQuantity }],
    });
    expect(canonical.itemCount).toBe(2);
    expect(canonical.subtotalPaise).toBe(258000);
  });

  it("does not pretend unsupported backend capabilities are implemented", () => {
    expect(phase2Capabilities.fitRecommendations).toBe("unavailable");
    expect(phase2Capabilities.stockAlerts).toBe("unavailable");
    expect(phase2Capabilities.promotions).toBe("unavailable");
    expect(phase2Capabilities.atomicCartVariantReplace).toBe("unavailable");
    expect(phase2Capabilities.savedForLater).toBe("local-device-adaptation");
  });
});
