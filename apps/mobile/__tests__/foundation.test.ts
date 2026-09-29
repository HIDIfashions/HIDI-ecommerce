import { hidiAccessibility, hidiColors } from "../src/theme/tokens";
import { screenRegistry } from "../src/spec/screenRegistry";

describe("HIDI mobile foundation", () => {
  it("keeps blueprint visual tokens", () => {
    expect(hidiColors.light.canvas).toBe("#FAF8F4");
    expect(hidiColors.light.action).toBe("#702B42");
    expect(hidiAccessibility.minTouchTarget).toBe(48);
  });

  it("tracks all blueprint screens exactly once", () => {
    expect(screenRegistry).toHaveLength(132);
    expect(new Set(screenRegistry.map((screen) => screen.id)).size).toBe(132);
  });

  it("keeps only approved P1 screens optional", () => {
    expect(screenRegistry.filter((screen) => screen.priority === "P1").map((screen) => screen.id)).toEqual([
      "H119",
      "H120",
      "H127",
    ]);
  });
});
