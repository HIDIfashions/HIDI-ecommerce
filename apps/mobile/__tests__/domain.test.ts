import { discountPercent, money, productMrp, type Product } from "../src/domain";
import { filterAndSortProducts, emptyCatalogFilters } from "../src/catalogLogic";
import { normalizePhone } from "../src/api";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1", slug: "sage-kurta", name: "Sage Kurta", brand: "HIDI", fabric: "Cotton blend",
    category: { id: "c1", name: "Ethnic Wear", slug: "ethnic-wear" }, collections: [{ id: "co1", name: "Work Edit", slug: "work-edit" }], images: [],
    variants: [
      { id: "v1", sku: "S-M-GREEN", size: "M", color: "Green", mrpPaise: 199900, pricePaise: 149900, available: 2 },
      { id: "v2", sku: "S-L-RED", size: "L", color: "Red", mrpPaise: 199900, pricePaise: 159900, available: 0 },
    ], minPricePaise: 149900, maxPricePaise: 159900, inStock: true, ...overrides,
  };
}

describe("premium commerce logic", () => {
  it("preserves paise and computes visual discount", () => {
    expect(money(129999)).toContain("1,299.99");
    expect(productMrp(product())).toBe(199900);
    expect(discountPercent(product())).toBe(25);
  });
  it("requires one in-stock SKU to satisfy size and colour together", () => {
    expect(filterAndSortProducts([product()], { ...emptyCatalogFilters, sizes: ["M"], colors: ["Red"] }, "recommended")).toEqual([]);
    expect(filterAndSortProducts([product()], { ...emptyCatalogFilters, sizes: ["M"], colors: ["Green"] }, "recommended")).toHaveLength(1);
  });
  it("sorts by price and discount", () => {
    const expensive = product({ id: "p2", slug: "p2", minPricePaise: 249900, variants: [{ id: "x", sku: "x", size: "M", color: "Blue", mrpPaise: 299900, pricePaise: 249900, available: 1 }] });
    expect(filterAndSortProducts([expensive, product()], emptyCatalogFilters, "price-low")[0]?.id).toBe("p1");
  });
  it("normalizes Indian phone numbers", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(() => normalizePhone("123")).toThrow("valid");
  });
});
